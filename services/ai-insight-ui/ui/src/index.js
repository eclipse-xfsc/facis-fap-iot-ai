// @ts-nocheck
'use strict'

// ================================================================
// KEYCLOAK INITIALIZATION
// ================================================================
// Keycloak must authenticate BEFORE the Vue app mounts.
// The login overlay (#login-overlay) is visible until auth succeeds.
const keycloak = new Keycloak({
    url: 'https://identity.facis.cloud',
    realm: 'facis',
    clientId: 'facis-ai-insight'
});

keycloak.init({
    onLoad: 'login-required',      // redirect to Keycloak login immediately
    checkLoginIframe: false,        // avoid CORS issues with iframe check
    pkceMethod: 'S256'              // PKCE for public clients
}).then(function(authenticated) {
    if (!authenticated) {
        window.location.reload();
        return;
    }

    // Hide login overlay, show the Vue app
    var overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';

    // Schedule token refresh (every 60s, refresh if <70s remaining)
    setInterval(function() {
        keycloak.updateToken(70).catch(function() {
            console.warn('[Keycloak] Token refresh failed, re-authenticating...');
            keycloak.login();
        });
    }, 60000);

    // Mount the Vue app now that we're authenticated
    mountApp();
}).catch(function(err) {
    console.error('[Keycloak] Init failed:', err);
    var overlay = document.getElementById('login-overlay');
    if (overlay) {
        overlay.innerHTML = '<div style="text-align:center;padding:48px;background:white;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);font-family:Figtree,sans-serif;">' +
            '<h2 style="color:#ef4444;">Authentication Failed</h2>' +
            '<p style="color:#64748b;">Could not connect to FACIS Identity Provider.</p>' +
            '<button onclick="window.location.reload()" style="margin-top:16px;padding:10px 24px;background:#005fff;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px;">Retry</button></div>';
    }
});

function mountApp() {

const { createApp } = Vue

const app = createApp({
    data() {
        return {
            // --- Auth ---
            userName: keycloak.tokenParsed?.preferred_username || keycloak.tokenParsed?.name || 'User',
            userInitial: (keycloak.tokenParsed?.preferred_username || 'U').charAt(0).toUpperCase(),

            // --- Debug ---
            debugMessages: [],

            // --- Socket ---
            _socketId: null,

            // --- View State ---
            isLoading: false,
            isTyping: false,
            showChartPanel: false,
            errorMessage: '',

            // --- LLM Provider ---
            // NOTE: field is 'label' to match the <option> binding in index.html
            selectedLLM: 'openai',
            llmProviders: [
                { id: 'openai', label: 'OpenAI GPT-4.1', icon: '' },
                { id: 'claude', label: 'Claude Sonnet',  icon: '' },
                { id: 'custom', label: 'Custom LLM',    icon: '' }
            ],

            // --- KPI Cards ---
            // trendValue is included so the template binding {{ kpi.trendValue }} renders cleanly
            kpiData: {
                netGrid: {
                    value: '--', unit: 'kW', label: 'Net Grid Power',
                    trend: 'stable', trendValue: '', icon: '⚡'
                },
                pvGeneration: {
                    value: '--', unit: 'kW', label: 'PV Generation',
                    trend: 'stable', trendValue: '', icon: '☀️'
                },
                dailyCost: {
                    value: '--', unit: 'EUR', label: 'Daily Cost',
                    trend: 'stable', trendValue: '', icon: '💰'
                },
                anomalies: {
                    value: '--', unit: '', label: 'Anomalies',
                    trend: 'stable', trendValue: '', icon: '🔍'
                }
            },

            // --- Smart Prompts ---
            smartPrompts: [
                {
                    id: 'energy-cost',
                    label: 'Energy Cost Situation',
                    icon: '💶',
                    prompt: 'What is the current energy cost situation?',
                    topic: 'insight.request',
                    action: 'energy-summary'
                },
                {
                    id: 'pv-forecast',
                    label: 'PV Forecast Today',
                    icon: '🌤️',
                    prompt: 'What is the forecast for PV generation today?',
                    topic: 'insight.request',
                    action: 'energy-summary'
                },
                {
                    id: 'anomaly-check',
                    label: 'Check Anomalies',
                    icon: '⚠️',
                    prompt: 'Are there any anomalies in energy consumption?',
                    topic: 'insight.request',
                    action: 'anomaly-report'
                },
                {
                    id: 'city-events',
                    label: 'City Event Impact',
                    icon: '🏙️',
                    prompt: 'How are city events affecting infrastructure?',
                    topic: 'insight.request',
                    action: 'city-status'
                },
                {
                    id: 'cost-shift',
                    label: 'Cost Optimization',
                    icon: '📊',
                    prompt: 'What optimisation potential do we have for shifting consumption?',
                    topic: 'insight.request',
                    action: 'energy-summary'
                },
                {
                    id: 'lighting-why',
                    label: 'Why Lighting Changed',
                    icon: '💡',
                    prompt: 'Why did lighting increase in the zones yesterday?',
                    topic: 'insight.request',
                    action: 'city-status'
                }
            ],

            // --- Conversation ---
            messages: [],
            messageIdCounter: 0,
            userInput: '',
            conversationContext: [],

            // --- Time Range ---
            timeRange: {
                start: null,
                end: null,
                preset: '30d'
            },
            timeRanges: [
                { value: '24h', label: '24h' },
                { value: '7d',  label: '7 Days' },
                { value: '30d', label: '30 Days' }
            ],

            // --- Charts ---
            activeChart: 'forecast',
            chartTypes: [
                { id: 'forecast', label: '24h Forecast' },
                { id: 'cost',     label: 'Cost Trend' },
                { id: 'pv',       label: 'PV Performance' }
            ],
            chartInstance: null,
            chartData: {
                forecast: null,
                cost: null,
                pv: null
            }
        }
    },

    computed: {
        canSend() {
            return this.userInput.trim().length > 0 && !this.isTyping;
        }
    },

    methods: {
        // ============================================================
        // SESSION MANAGEMENT
        // ============================================================
        getCookie(name) {
            let value = '; ' + document.cookie;
            let parts = value.split('; ' + name + '=');
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        },

        initSession() {
            this.calculateTimeRange(this.timeRange.preset);
        },

        // ============================================================
        // TIME RANGE
        // ============================================================
        calculateTimeRange(preset) {
            // The demo dataset covers early March 2026.
            // Use that window so queries return data.
            const dataEnd = new Date('2026-03-10T00:00:00Z');
            let start;
            switch (preset) {
                case '24h':
                    start = new Date(dataEnd.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    start = new Date(dataEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                default:
                    start = new Date(dataEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
            }
            this.timeRange.preset = preset;
            this.timeRange.start  = start.toISOString();
            this.timeRange.end    = dataEnd.toISOString();
        },

        setTimeRange(preset) {
            this.calculateTimeRange(preset);
        },

        // ============================================================
        // UIBUILDER COMMUNICATION
        // ============================================================
        sendToBackend(topic, recordDetails) {
            uibuilder.send({
                data: {
                    topic: topic,
                    session: {
                        sessionId: this.getCookie('sid'),
                        clientId:  this.getCookie('uibuilder-client-id'),
                        _socketId: this._socketId,
                        user:      keycloak.tokenParsed?.preferred_username || null,
                        token:     keycloak.token || null
                    },
                    recordDetails: recordDetails
                }
            });
        },

        handleBackendMessage(msg) {
            // Debug: show raw message in the debug panel
            this.debugMessages.unshift(new Date().toLocaleTimeString() + ' | ' + JSON.stringify(msg).substring(0, 300));
            if (this.debugMessages.length > 20) this.debugMessages.length = 20;

            const topic   = msg?.data?.topic;
            const details = msg?.data?.recordDetails;

            // Only clear typing for actual user-facing responses (not background KPI)
            if (topic === 'insight.response' || topic === 'llm.response' || topic === 'error') {
                this.isTyping = false;
            }

            if (!topic) return;

            switch (topic) {
                case 'insight.response':
                    this.handleInsightResponse(details);
                    break;
                case 'llm.response':
                    this.handleLLMResponse(details);
                    break;
                case 'kpi.update':
                    this.handleKPIUpdate(details);
                    break;
                case 'kpi.response':
                    this.handleKPIResponse(details);
                    break;
                case 'latest.response':
                    this.handleLatestResponse(details);
                    break;
                case 'error':
                    this.handleError(details);
                    break;
                default:
                    console.warn('[AI Insight UI] Unknown topic:', topic);
            }

            // Capture socket ID whenever the backend echoes it
            if (msg._socketId) {
                this._socketId = msg._socketId;
            }
        },

        // ============================================================
        // SMART PROMPTS & FREEFORM
        // ============================================================
        handleSmartPrompt(sp) {
            this.addMessage(sp.prompt, 'user');
            this.isTyping = true;

            if (sp.topic === 'insight.request') {
                // Path A: Structured insight via AI Insight Service
                this.sendToBackend('insight.request', {
                    action: sp.action,
                    params: {
                        start_ts: this.timeRange.start,
                        end_ts:   this.timeRange.end,
                        timezone: 'UTC'
                    },
                    promptText:       sp.prompt,
                    selectedProvider: this.selectedLLM
                });
            } else {
                // Path B: Freeform via LLM Router
                this.sendToBackend('llm.freeform', {
                    userQuestion:        sp.prompt,
                    selectedProvider:    this.selectedLLM,
                    conversationContext: this.getConversationContext(),
                    params: {
                        start_ts: this.timeRange.start,
                        end_ts:   this.timeRange.end,
                        timezone: 'UTC'
                    }
                });
            }
        },

        sendFreeformQuestion() {
            const question = this.userInput.trim();
            if (!question || this.isTyping) return;

            this.addMessage(question, 'user');
            this.userInput = '';
            this.isTyping  = true;

            // Path B: All freeform questions go through LLM Router
            this.sendToBackend('llm.freeform', {
                userQuestion:        question,
                selectedProvider:    this.selectedLLM,
                conversationContext: this.getConversationContext(),
                params: {
                    start_ts: this.timeRange.start,
                    end_ts:   this.timeRange.end,
                    timezone: 'UTC'
                }
            });
        },

        // ============================================================
        // RESPONSE HANDLERS
        // ============================================================
        handleInsightResponse(details) {
            this.isTyping = false;
            if (!details || !details.insight) {
                this.addMessage('No insight data received. The service may be unavailable.', 'ai');
                return;
            }

            const insight = details.insight;

            this.addMessage(insight.summary || 'Insight generated.', 'ai', {
                structured:      true,
                keyFindings:     insight.keyFindings || insight.key_findings || [],
                recommendations: insight.recommendations || [],
                metadata: {
                    insight_type: insight.type || insight.insight_type || details.action,
                    llm_model:    insight.metadata?.llm_model || 'deterministic',
                    timestamp:    insight.metadata?.timestamp || new Date().toISOString(),
                    llm_used:     insight.metadata?.llm_used
                }
            });

            // If the response includes chart data, surface the chart panel
            if (insight.chartData || insight.data) {
                this.processChartData(insight.chartData || insight.data);
            }

            // Populate KPI cards from insight data
            const idata = insight.data;
            if (idata) {
                if (idata.moving_averages) {
                    const ma = idata.moving_averages;
                    if (ma.net_grid_kw) this.kpiData.netGrid.value = this.formatNumber(ma.net_grid_kw.latest_value);
                    if (ma.avg_consumption_kw && ma.net_grid_kw) {
                        const pvGen = (ma.avg_consumption_kw.latest_value || 0) - (ma.net_grid_kw.latest_value || 0);
                        if (pvGen > 0) this.kpiData.pvGeneration.value = this.formatNumber(pvGen);
                    }
                }
                if (idata.forecast_24h && idata.forecast_24h.length > 0) {
                    const last = idata.forecast_24h[idata.forecast_24h.length - 1];
                    if (last.net_grid_kw) this.kpiData.netGrid.value = this.formatNumber(last.net_grid_kw);
                    if (last.estimated_hourly_cost_eur) this.kpiData.dailyCost.value = this.formatNumber(last.estimated_hourly_cost_eur * 24);
                }
                if (idata.daily_overview) {
                    this.kpiData.netGrid.trend = idata.daily_overview.consumption_trend_daily || 'stable';
                }
                if (idata.summary && idata.summary.total_outliers !== undefined) {
                    this.kpiData.anomalies.value = String(idata.summary.total_outliers);
                }
            }
        },

        handleLLMResponse(details) {
            this.isTyping = false;
            if (!details || !details.response) {
                this.addMessage('No response received from the AI provider.', 'ai');
                return;
            }

            const response = details.response;
            this.addMessage(response.text || response.content || 'Empty response.', 'ai', {
                structured: false,
                metadata: {
                    insight_type: 'freeform',
                    llm_model:    response.model || response.provider || this.selectedLLM,
                    timestamp:    response.timestamp || new Date().toISOString()
                }
            });
        },

        handleKPIResponse(details) {
            // Silent KPI population from insight responses
            if (!details || !details.insight) return;
            const insight = details.insight;
            const idata = insight.data;
            if (idata) {
                if (idata.moving_averages) {
                    const ma = idata.moving_averages;
                    if (ma.net_grid_kw) this.kpiData.netGrid.value = this.formatNumber(ma.net_grid_kw.latest_value);
                    if (ma.avg_consumption_kw && ma.net_grid_kw) {
                        const pvGen = (ma.avg_consumption_kw.latest_value || 0) - (ma.net_grid_kw.latest_value || 0);
                        if (pvGen > 0) this.kpiData.pvGeneration.value = this.formatNumber(pvGen);
                    }
                }
                if (idata.forecast_24h && idata.forecast_24h.length > 0) {
                    const last = idata.forecast_24h[idata.forecast_24h.length - 1];
                    if (last.net_grid_kw) this.kpiData.netGrid.value = this.formatNumber(last.net_grid_kw);
                    if (last.estimated_hourly_cost_eur) this.kpiData.dailyCost.value = this.formatNumber(last.estimated_hourly_cost_eur * 24);
                }
                if (idata.daily_overview) {
                    this.kpiData.netGrid.trend = idata.daily_overview.consumption_trend_daily || 'stable';
                }
                if (idata.summary && idata.summary.total_outliers !== undefined) {
                    this.kpiData.anomalies.value = String(idata.summary.total_outliers);
                }
            }
        },

        handleKPIUpdate(details) {
            if (!details) return;

            if (details.netGrid !== undefined) {
                this.kpiData.netGrid.value = this.formatNumber(details.netGrid);
                this.kpiData.netGrid.trend = details.netGridTrend || 'stable';
            }
            if (details.pvGeneration !== undefined) {
                this.kpiData.pvGeneration.value = this.formatNumber(details.pvGeneration);
                this.kpiData.pvGeneration.trend = details.pvTrend || 'stable';
            }
            if (details.dailyCost !== undefined) {
                this.kpiData.dailyCost.value = this.formatNumber(details.dailyCost);
                this.kpiData.dailyCost.trend = details.costTrend || 'stable';
            }
            if (details.anomalies !== undefined) {
                this.kpiData.anomalies.value = String(details.anomalies);
                this.kpiData.anomalies.trend = details.anomalies > 0 ? 'up' : 'stable';
            }
        },

        handleLatestResponse(details) {
            if (!details || !details.latest) return;
            const latest = details.latest;

            // Extract KPI data from latest cached insights
            const esEntry = latest['energy-summary'];
            if (esEntry) {
                const es = esEntry.output || esEntry;
                if (es.summary) {
                    this.kpiData.netGrid.value = 'Active';
                    this.kpiData.pvGeneration.value = 'Active';
                    this.kpiData.dailyCost.value = 'Active';
                }
            }

            // Extract KPI data from latest cached anomaly-report insight
            const arEntry = latest['anomaly-report'];
            if (arEntry) {
                const ar = arEntry.output || arEntry;
                if (ar.data && ar.data.summary) {
                    this.kpiData.anomalies.value = String(ar.data.summary.total_outliers || 0);
                }
            }
        },

        handleError(details) {
            this.isTyping = false;
            const errorMsg = details?.message || details?.error || 'An unexpected error occurred.';
            this.errorMessage = errorMsg;
            this.addMessage('Error: ' + errorMsg, 'ai');

            // Auto-dismiss the error toast after 5 s
            setTimeout(() => { this.errorMessage = ''; }, 5000);
        },

        // ============================================================
        // MESSAGE MANAGEMENT
        // ============================================================
        addMessage(content, type, extras) {
            const msg = {
                id:              ++this.messageIdCounter,
                content:         content,
                type:            type,
                timestamp:       new Date(),
                structured:      extras?.structured      || false,
                keyFindings:     extras?.keyFindings     || null,
                recommendations: extras?.recommendations || null,
                metadata:        extras?.metadata        || null
            };
            this.messages.push(msg);

            // Maintain a rolling conversation context for follow-up questions
            this.conversationContext.push({
                role:    type === 'user' ? 'user' : 'assistant',
                content: content
            });
            // Keep only the last 10 turns to avoid unbounded growth
            if (this.conversationContext.length > 10) {
                this.conversationContext = this.conversationContext.slice(-10);
            }

            this.$nextTick(() => {
                this.scrollToBottom();
            });
        },

        getConversationContext() {
            return this.conversationContext.slice(-6);
        },

        scrollToBottom() {
            const container = this.$refs.conversationArea;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        },

        // ============================================================
        // FORMATTING
        // ============================================================
        renderMarkdown(text) {
            if (!text) return '';
            try {
                if (typeof marked !== 'undefined') {
                    return marked.parse(text);
                }
            } catch (e) {
                // Fallback: simple newline conversion
            }
            return text.replace(/\n/g, '<br>');
        },

        formatTime(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        formatTimestamp(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleString([], {
                month:  'short',
                day:    'numeric',
                hour:   '2-digit',
                minute: '2-digit'
            });
        },

        formatNumber(val) {
            if (val === null || val === undefined || val === '--') return '--';
            const num = parseFloat(val);
            if (isNaN(num)) return val;
            return num.toFixed(1);
        },

        // ============================================================
        // CHART MANAGEMENT
        // ============================================================
        processChartData(data) {
            if (!data) return;

            // Build forecast dataset from 24 h forecast array
            if (data.forecast_24h && data.forecast_24h.length > 0) {
                this.chartData.forecast = {
                    labels: data.forecast_24h.map(p => {
                        const d = new Date(p.timestamp);
                        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }),
                    datasets: [
                        {
                            label:           'Net Grid (kW)',
                            data:            data.forecast_24h.map(p => p.net_grid_kw),
                            borderColor:     '#005fff',
                            backgroundColor: 'rgba(0, 95, 255, 0.1)',
                            fill:            true,
                            tension:         0.4
                        },
                        {
                            label:           'Consumption (kW)',
                            data:            data.forecast_24h.map(p => p.avg_consumption_kw),
                            borderColor:     '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            fill:            false,
                            tension:         0.4
                        },
                        {
                            label:           'Est. Cost (EUR/h)',
                            data:            data.forecast_24h.map(p => p.estimated_hourly_cost_eur),
                            borderColor:     '#22c55e',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            fill:            false,
                            tension:         0.4,
                            yAxisID:         'y1'
                        }
                    ]
                };
                this.showChartPanel = true;
                this.activeChart    = 'forecast';
                this.$nextTick(() => this.renderChart());
            }

            // Future: process daily_overview.daily_cost_points into this.chartData.cost
        },

        renderChart() {
            const canvas = this.$refs.chartCanvas;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Tear down any existing Chart.js instance before re-drawing
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }

            const data = this.chartData[this.activeChart];
            if (!data) return;

            const config = {
                type: 'line',
                data: data,
                options: {
                    responsive:          true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode:      'index'
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                font:            { family: "'Figtree', sans-serif", size: 12 },
                                usePointStyle:   true,
                                pointStyleWidth: 10,
                                padding:         16
                            }
                        },
                        tooltip: {
                            backgroundColor: '#1e293b',
                            titleFont:       { family: "'Figtree', sans-serif" },
                            bodyFont:        { family: "'Figtree', sans-serif" },
                            cornerRadius:    8,
                            padding:         12
                        }
                    },
                    scales: {
                        x: {
                            grid:  { display: false },
                            ticks: {
                                font:          { family: "'Figtree', sans-serif", size: 11 },
                                maxRotation:   45,
                                maxTicksLimit: 12
                            }
                        },
                        y: {
                            position: 'left',
                            grid:     { color: '#f1f5f9' },
                            ticks:    { font: { family: "'Figtree', sans-serif", size: 11 } },
                            title: {
                                display: true,
                                text:    'Power (kW)',
                                font:    { family: "'Figtree', sans-serif", size: 12 }
                            }
                        },
                        y1: {
                            position: 'right',
                            grid:     { drawOnChartArea: false },
                            ticks:    { font: { family: "'Figtree', sans-serif", size: 11 } },
                            title: {
                                display: true,
                                text:    'Cost (EUR/h)',
                                font:    { family: "'Figtree', sans-serif", size: 12 }
                            }
                        }
                    }
                }
            };

            this.chartInstance = new Chart(ctx, config);
        },

        switchChart(chartId) {
            this.activeChart = chartId;
            this.$nextTick(() => this.renderChart());
        },

        // ============================================================
        // LLM PROVIDER
        // ============================================================
        switchLLM(providerId) {
            this.selectedLLM = providerId;
        },

        // ============================================================
        // AUTHENTICATION
        // ============================================================
        logout() {
            keycloak.logout({ redirectUri: window.location.origin + '/aiInsight/' });
        }
    },

    mounted() {
        // Initialise UIBUILDER and open the socket connection
        uibuilder.start();

        // Seed the time-range state before requesting data
        this.initSession();

        // Route all backend messages through the central handler
        const vueApp = this;

        // UIBUILDER v7: listen for ALL message events
        uibuilder.onChange('msg', function(msg) {
            console.log('[UIB] onChange msg:', JSON.stringify(msg).substring(0, 500));
            vueApp.handleBackendMessage(msg);
        });

        // Also try the v7 onTopic handler as fallback
        if (typeof uibuilder.onTopic === 'function') {
            uibuilder.onTopic('*', function(msg) {
                console.log('[UIB] onTopic:', JSON.stringify(msg).substring(0, 500));
                vueApp.handleBackendMessage(msg);
            });
        }

        // Capture socket ID from control messages (connect / reconnect)
        uibuilder.onChange('ctrlMsg', function(msg) {
            console.log('[UIB] ctrlMsg:', JSON.stringify(msg).substring(0, 200));
            if (msg._socketId) {
                vueApp._socketId = msg._socketId;
            }
        });

        // Log connection status
        uibuilder.onChange('isConnected', function(val) {
            console.log('[UIB] isConnected:', val);
        });

        // Log ALL socket events for debugging
        if (uibuilder.socket) {
            uibuilder.socket.onAny(function(event, data) {
                console.log('[UIB SOCKET]', event, JSON.stringify(data).substring(0, 300));
            });
        }

        // Load KPIs from cached latest insights (instant, no heavy queries)
        const self = this;
        setTimeout(function() {
            self.sendToBackend('init', { action: 'load-latest' });
        }, 2000);
    },

    beforeUnmount() {
        // Clean up Chart.js instance to prevent canvas memory leaks
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }
    }
});

app.mount('#app');

} // end mountApp()
