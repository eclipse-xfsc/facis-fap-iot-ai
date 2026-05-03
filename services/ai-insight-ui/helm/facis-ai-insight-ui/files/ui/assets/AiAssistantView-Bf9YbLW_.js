const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-BuosndfI.js","assets/index-CyPaB3Dj.css"])))=>i.map(i=>d[i]);
import{W as Ce,X as xe,bv as Se,ao as Pe,as as we,Q as De,O as Me,b as y,c as k,g as r,a4 as be,n as j,a3 as oe,h as ae,t as D,a7 as pe,aF as de,D as ze,F as z,j as G,k as Fe,av as Re,w as Te,d as Ke,r as P,C as ne,a as Ne,o as qe,bm as He,A as Ue,G as je,H as Ge,J as Ze,L as Je,M as Qe,by as me,e as H,f as ee,i as te,s as _e,l as Xe,b6 as Ye,af as et,aa as tt,bp as ke,_ as nt}from"./index-BuosndfI.js";import{s as ot}from"./index-CH5hmYI-.js";import{P as it}from"./PageHeader-C6DQ1rwQ.js";import{K as at}from"./KpiCard-9czf-8vC.js";import{T as $e}from"./TimeSeriesChart-B1KwioMJ.js";var st=`
    .p-togglebutton {
        display: inline-flex;
        cursor: pointer;
        user-select: none;
        overflow: hidden;
        position: relative;
        color: dt('togglebutton.color');
        background: dt('togglebutton.background');
        border: 1px solid dt('togglebutton.border.color');
        padding: dt('togglebutton.padding');
        font-size: 1rem;
        font-family: inherit;
        font-feature-settings: inherit;
        transition:
            background dt('togglebutton.transition.duration'),
            color dt('togglebutton.transition.duration'),
            border-color dt('togglebutton.transition.duration'),
            outline-color dt('togglebutton.transition.duration'),
            box-shadow dt('togglebutton.transition.duration');
        border-radius: dt('togglebutton.border.radius');
        outline-color: transparent;
        font-weight: dt('togglebutton.font.weight');
    }

    .p-togglebutton-content {
        display: inline-flex;
        flex: 1 1 auto;
        align-items: center;
        justify-content: center;
        gap: dt('togglebutton.gap');
        padding: dt('togglebutton.content.padding');
        background: transparent;
        border-radius: dt('togglebutton.content.border.radius');
        transition:
            background dt('togglebutton.transition.duration'),
            color dt('togglebutton.transition.duration'),
            border-color dt('togglebutton.transition.duration'),
            outline-color dt('togglebutton.transition.duration'),
            box-shadow dt('togglebutton.transition.duration');
    }

    .p-togglebutton:not(:disabled):not(.p-togglebutton-checked):hover {
        background: dt('togglebutton.hover.background');
        color: dt('togglebutton.hover.color');
    }

    .p-togglebutton.p-togglebutton-checked {
        background: dt('togglebutton.checked.background');
        border-color: dt('togglebutton.checked.border.color');
        color: dt('togglebutton.checked.color');
    }

    .p-togglebutton-checked .p-togglebutton-content {
        background: dt('togglebutton.content.checked.background');
        box-shadow: dt('togglebutton.content.checked.shadow');
    }

    .p-togglebutton:focus-visible {
        box-shadow: dt('togglebutton.focus.ring.shadow');
        outline: dt('togglebutton.focus.ring.width') dt('togglebutton.focus.ring.style') dt('togglebutton.focus.ring.color');
        outline-offset: dt('togglebutton.focus.ring.offset');
    }

    .p-togglebutton.p-invalid {
        border-color: dt('togglebutton.invalid.border.color');
    }

    .p-togglebutton:disabled {
        opacity: 1;
        cursor: default;
        background: dt('togglebutton.disabled.background');
        border-color: dt('togglebutton.disabled.border.color');
        color: dt('togglebutton.disabled.color');
    }

    .p-togglebutton-label,
    .p-togglebutton-icon {
        position: relative;
        transition: none;
    }

    .p-togglebutton-icon {
        color: dt('togglebutton.icon.color');
    }

    .p-togglebutton:not(:disabled):not(.p-togglebutton-checked):hover .p-togglebutton-icon {
        color: dt('togglebutton.icon.hover.color');
    }

    .p-togglebutton.p-togglebutton-checked .p-togglebutton-icon {
        color: dt('togglebutton.icon.checked.color');
    }

    .p-togglebutton:disabled .p-togglebutton-icon {
        color: dt('togglebutton.icon.disabled.color');
    }

    .p-togglebutton-sm {
        padding: dt('togglebutton.sm.padding');
        font-size: dt('togglebutton.sm.font.size');
    }

    .p-togglebutton-sm .p-togglebutton-content {
        padding: dt('togglebutton.content.sm.padding');
    }

    .p-togglebutton-lg {
        padding: dt('togglebutton.lg.padding');
        font-size: dt('togglebutton.lg.font.size');
    }

    .p-togglebutton-lg .p-togglebutton-content {
        padding: dt('togglebutton.content.lg.padding');
    }

    .p-togglebutton-fluid {
        width: 100%;
    }
`,rt={root:function(t){var o=t.instance,m=t.props;return["p-togglebutton p-component",{"p-togglebutton-checked":o.active,"p-invalid":o.$invalid,"p-togglebutton-fluid":m.fluid,"p-togglebutton-sm p-inputfield-sm":m.size==="small","p-togglebutton-lg p-inputfield-lg":m.size==="large"}]},content:"p-togglebutton-content",icon:"p-togglebutton-icon",label:"p-togglebutton-label"},lt=Ce.extend({name:"togglebutton",style:st,classes:rt}),ut={name:"BaseToggleButton",extends:Se,props:{onIcon:String,offIcon:String,onLabel:{type:String,default:"Yes"},offLabel:{type:String,default:"No"},readonly:{type:Boolean,default:!1},tabindex:{type:Number,default:null},ariaLabelledby:{type:String,default:null},ariaLabel:{type:String,default:null},size:{type:String,default:null},fluid:{type:Boolean,default:null}},style:lt,provide:function(){return{$pcToggleButton:this,$parentInstance:this}}};function se(e){"@babel/helpers - typeof";return se=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},se(e)}function dt(e,t,o){return(t=ct(t))in e?Object.defineProperty(e,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):e[t]=o,e}function ct(e){var t=gt(e,"string");return se(t)=="symbol"?t:t+""}function gt(e,t){if(se(e)!="object"||!e)return e;var o=e[Symbol.toPrimitive];if(o!==void 0){var m=o.call(e,t);if(se(m)!="object")return m;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}var Ie={name:"ToggleButton",extends:ut,inheritAttrs:!1,emits:["change"],methods:{getPTOptions:function(t){var o=t==="root"?this.ptmi:this.ptm;return o(t,{context:{active:this.active,disabled:this.disabled}})},onChange:function(t){!this.disabled&&!this.readonly&&(this.writeValue(!this.d_value,t),this.$emit("change",t))},onBlur:function(t){var o,m;(o=(m=this.formField).onBlur)===null||o===void 0||o.call(m,t)}},computed:{active:function(){return this.d_value===!0},hasLabel:function(){return we(this.onLabel)&&we(this.offLabel)},label:function(){return this.hasLabel?this.d_value?this.onLabel:this.offLabel:" "},dataP:function(){return Pe(dt({checked:this.active,invalid:this.$invalid},this.size,this.size))}},directives:{ripple:xe}},pt=["tabindex","disabled","aria-pressed","aria-label","aria-labelledby","data-p-checked","data-p-disabled","data-p"],mt=["data-p"];function bt(e,t,o,m,p,s){var b=De("ripple");return Me((y(),k("button",oe({type:"button",class:e.cx("root"),tabindex:e.tabindex,disabled:e.disabled,"aria-pressed":e.d_value,onClick:t[0]||(t[0]=function(){return s.onChange&&s.onChange.apply(s,arguments)}),onBlur:t[1]||(t[1]=function(){return s.onBlur&&s.onBlur.apply(s,arguments)})},s.getPTOptions("root"),{"aria-label":e.ariaLabel,"aria-labelledby":e.ariaLabelledby,"data-p-checked":s.active,"data-p-disabled":e.disabled,"data-p":s.dataP}),[r("span",oe({class:e.cx("content")},s.getPTOptions("content"),{"data-p":s.dataP}),[be(e.$slots,"default",{},function(){return[be(e.$slots,"icon",{value:e.d_value,class:j(e.cx("icon"))},function(){return[e.onIcon||e.offIcon?(y(),k("span",oe({key:0,class:[e.cx("icon"),e.d_value?e.onIcon:e.offIcon]},s.getPTOptions("icon")),null,16)):ae("",!0)]}),r("span",oe({class:e.cx("label")},s.getPTOptions("label")),D(s.label),17)]})],16,mt)],16,pt)),[[b]])}Ie.render=bt;var ft=`
    .p-selectbutton {
        display: inline-flex;
        user-select: none;
        vertical-align: bottom;
        outline-color: transparent;
        border-radius: dt('selectbutton.border.radius');
    }

    .p-selectbutton .p-togglebutton {
        border-radius: 0;
        border-width: 1px 1px 1px 0;
    }

    .p-selectbutton .p-togglebutton:focus-visible {
        position: relative;
        z-index: 1;
    }

    .p-selectbutton .p-togglebutton:first-child {
        border-inline-start-width: 1px;
        border-start-start-radius: dt('selectbutton.border.radius');
        border-end-start-radius: dt('selectbutton.border.radius');
    }

    .p-selectbutton .p-togglebutton:last-child {
        border-start-end-radius: dt('selectbutton.border.radius');
        border-end-end-radius: dt('selectbutton.border.radius');
    }

    .p-selectbutton.p-invalid {
        outline: 1px solid dt('selectbutton.invalid.border.color');
        outline-offset: 0;
    }

    .p-selectbutton-fluid {
        width: 100%;
    }
    
    .p-selectbutton-fluid .p-togglebutton {
        flex: 1 1 0;
    }
`,ht={root:function(t){var o=t.props,m=t.instance;return["p-selectbutton p-component",{"p-invalid":m.$invalid,"p-selectbutton-fluid":o.fluid}]}},vt=Ce.extend({name:"selectbutton",style:ft,classes:ht}),yt={name:"BaseSelectButton",extends:Se,props:{options:Array,optionLabel:null,optionValue:null,optionDisabled:null,multiple:Boolean,allowEmpty:{type:Boolean,default:!0},dataKey:null,ariaLabelledby:{type:String,default:null},size:{type:String,default:null},fluid:{type:Boolean,default:null}},style:vt,provide:function(){return{$pcSelectButton:this,$parentInstance:this}}};function wt(e,t){var o=typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(!o){if(Array.isArray(e)||(o=Le(e))||t){o&&(e=o);var m=0,p=function(){};return{s:p,n:function(){return m>=e.length?{done:!0}:{done:!1,value:e[m++]}},e:function(T){throw T},f:p}}throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var s,b=!0,f=!1;return{s:function(){o=o.call(e)},n:function(){var T=o.next();return b=T.done,T},e:function(T){f=!0,s=T},f:function(){try{b||o.return==null||o.return()}finally{if(f)throw s}}}}function _t(e){return Ct(e)||$t(e)||Le(e)||kt()}function kt(){throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Le(e,t){if(e){if(typeof e=="string")return fe(e,t);var o={}.toString.call(e).slice(8,-1);return o==="Object"&&e.constructor&&(o=e.constructor.name),o==="Map"||o==="Set"?Array.from(e):o==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o)?fe(e,t):void 0}}function $t(e){if(typeof Symbol<"u"&&e[Symbol.iterator]!=null||e["@@iterator"]!=null)return Array.from(e)}function Ct(e){if(Array.isArray(e))return fe(e)}function fe(e,t){(t==null||t>e.length)&&(t=e.length);for(var o=0,m=Array(t);o<t;o++)m[o]=e[o];return m}var Ve={name:"SelectButton",extends:yt,inheritAttrs:!1,emits:["change"],methods:{getOptionLabel:function(t){return this.optionLabel?de(t,this.optionLabel):t},getOptionValue:function(t){return this.optionValue?de(t,this.optionValue):t},getOptionRenderKey:function(t){return this.dataKey?de(t,this.dataKey):this.getOptionLabel(t)},isOptionDisabled:function(t){return this.optionDisabled?de(t,this.optionDisabled):!1},isOptionReadonly:function(t){if(this.allowEmpty)return!1;var o=this.isSelected(t);return this.multiple?o&&this.d_value.length===1:o},onOptionSelect:function(t,o,m){var p=this;if(!(this.disabled||this.isOptionDisabled(o)||this.isOptionReadonly(o))){var s=this.isSelected(o),b=this.getOptionValue(o),f;if(this.multiple)if(s){if(f=this.d_value.filter(function(S){return!pe(S,b,p.equalityKey)}),!this.allowEmpty&&f.length===0)return}else f=this.d_value?[].concat(_t(this.d_value),[b]):[b];else{if(s&&!this.allowEmpty)return;f=s?null:b}this.writeValue(f,t),this.$emit("change",{originalEvent:t,value:f})}},isSelected:function(t){var o=!1,m=this.getOptionValue(t);if(this.multiple){if(this.d_value){var p=wt(this.d_value),s;try{for(p.s();!(s=p.n()).done;){var b=s.value;if(pe(b,m,this.equalityKey)){o=!0;break}}}catch(f){p.e(f)}finally{p.f()}}}else o=pe(this.d_value,m,this.equalityKey);return o}},computed:{equalityKey:function(){return this.optionValue?null:this.dataKey},dataP:function(){return Pe({invalid:this.$invalid})}},directives:{ripple:xe},components:{ToggleButton:Ie}},xt=["aria-labelledby","data-p"];function St(e,t,o,m,p,s){var b=ze("ToggleButton");return y(),k("div",oe({class:e.cx("root"),role:"group","aria-labelledby":e.ariaLabelledby},e.ptmi("root"),{"data-p":s.dataP}),[(y(!0),k(z,null,G(e.options,function(f,S){return y(),Fe(b,{key:s.getOptionRenderKey(f),modelValue:s.isSelected(f),onLabel:s.getOptionLabel(f),offLabel:s.getOptionLabel(f),disabled:e.disabled||s.isOptionDisabled(f),unstyled:e.unstyled,size:e.size,readonly:s.isOptionReadonly(f),onChange:function(N){return s.onOptionSelect(N,f,S)},pt:e.ptm("pcToggleButton")},Re({_:2},[e.$slots.option?{name:"default",fn:Te(function(){return[be(e.$slots,"option",{option:f,index:S},function(){return[r("span",oe({ref_for:!0},e.ptm("pcToggleButton").label),D(s.getOptionLabel(f)),17)]})]}),key:"0"}:void 0]),1032,["modelValue","onLabel","offLabel","disabled","unstyled","size","readonly","onChange","pt"])}),128))],16,xt)}Ve.render=St;const Pt=Ke("uibuilder",()=>{const e=P(!1),t=P(!1),o=P(null),m=P(null);let p=null;const s=[],b=new Map;async function f(){if(!(t.value||e.value)){t.value=!0;try{const l=window;l.uibuilder?(p=l.uibuilder,p.start(),p.onChange("connected",v=>{e.value=v}),p.onTopic("*",v=>{S(v)}),e.value=!0):o.value="UIBuilder runtime not found. Running in mock data mode."}catch(l){o.value=l instanceof Error?l.message:"UIBuilder init failed"}finally{t.value=!1}}}function S(l){var L,V,O,U,M;const v=(l==null?void 0:l.topic)??"";if(v==="kpi.update"){const W=(L=l.payload)==null?void 0:L.recordDetails;W&&(m.value=W)}if(v==="insight.response"){const W=(O=(V=l.payload)==null?void 0:V.recordDetails)==null?void 0:O.insight;if(W){const q=b.get("insight.request");if(q){clearTimeout(q.timeoutId),b.delete("insight.request");const le=T(W);q.resolve(le)}}}if(v==="llm.response"){const W=(M=(U=l.payload)==null?void 0:U.recordDetails)==null?void 0:M.response;if(W){const q=b.get("llm.freeform");q&&(clearTimeout(q.timeoutId),b.delete("llm.freeform"),q.resolve(W.text??""))}}s.forEach(W=>W(l))}function T(l){var L,V;let v=l.summary??"";return(L=l.keyFindings)!=null&&L.length&&(v+=`

**Key Findings:**
`+l.keyFindings.map(O=>`- ${O}`).join(`
`)),(V=l.recommendations)!=null&&V.length&&(v+=`

**Recommendations:**
`+l.recommendations.map(O=>`- ${O}`).join(`
`)),v}function N(l,v,L,V=3e4){return new Promise((O,U)=>{if(!p||!e.value){U(new Error("UIBuilder not connected"));return}const M=setTimeout(()=>{b.delete("insight.request"),U(new Error("insight.request timed out"))},V);b.set("insight.request",{resolve:O,reject:U,timeoutId:M}),p.send({topic:"insight.request",payload:{action:l,params:v,promptText:L}})})}function R(l,v=6e4){return new Promise((L,V)=>{if(!p||!e.value){V(new Error("UIBuilder not connected"));return}const O=setTimeout(()=>{b.delete("llm.freeform"),V(new Error("llm.freeform timed out"))},v);b.set("llm.freeform",{resolve:L,reject:V,timeoutId:O}),p.send({topic:"llm.freeform",payload:{query:l}})})}function Q(l,v){if(!p||!e.value){console.debug("[UIBuilder] send skipped (not connected):",l,v);return}p.send({topic:l,payload:v})}function Z(l){return s.push(l),()=>{const v=s.indexOf(l);v!==-1&&s.splice(v,1)}}function J(){var l;for(const[v,L]of b.entries())clearTimeout(L.timeoutId),L.reject(new Error("UIBuilder disconnected")),b.delete(v);if(p)try{(l=p.disconnect)==null||l.call(p)}catch{}p=null,e.value=!1,s.length=0}const re=ne(()=>e.value);return{connected:e,connecting:t,lastError:o,lastKpi:m,isAvailable:re,init:f,send:Q,requestInsight:N,requestLlm:R,onMessage:Z,disconnect:J}}),Ft={class:"assistant-page"},Tt={class:"assistant-body"},It={class:"chat-panel"},Lt={class:"chat-controls"},Vt={class:"cc-left"},Wt={class:"chat-kpis"},At={class:"ck-value"},Ot={class:"ck-unit"},Et={class:"ck-label"},Bt={class:"smart-prompts"},Dt=["disabled","onClick"],Mt={class:"chat-message__avatar"},zt={class:"chat-message__wrap"},Rt=["innerHTML"],Kt={key:1,class:"chat-message__content"},Nt={key:2,class:"insight-card"},qt={class:"ic-section ic-section--findings"},Ht={class:"ic-list"},Ut={class:"ic-section ic-section--recs"},jt={class:"ic-list"},Gt={class:"chat-message__time"},Zt={key:0,class:"chat-message chat-message--assistant"},Jt={class:"chat-input-row"},Qt={key:0,class:"chart-panel"},Xt={class:"chart-panel__tabs"},Yt=["onClick"],en={class:"chart-panel__content"},tn={class:"kpi-mini-grid"},nn=Ne({__name:"AiAssistantView",setup(e){const t=Pt(),o=P(!1),m=P(0),p=P(0),s=P(.12),b=P(0),f=P([]),S=P([]);qe(async()=>{if(await t.init(),t.connected){const $=t.onMessage(i=>{i.topic==="kpi.update"&&t.lastKpi});He($)}try{const[$,i,n]=await Promise.all([Ue(),je(),Ge()]);if($&&$.count>0){b.value=$.count;const C=await Promise.all($.meters.slice(0,5).map(E=>Ze(E.meter_id)));m.value=C.reduce((E,I)=>I?E+(I.readings.active_power_l1_w+I.readings.active_power_l2_w+I.readings.active_power_l3_w)/1e3:E,0)}if(i&&i.count>0){const C=await Je(i.systems[0].system_id);C&&(p.value=C.readings.power_kw)}n&&(s.value=n.current.price_eur_per_kwh);const u=await Qe();if(u&&(S.value=u.prices.map(C=>({timestamp:C.timestamp,priceEurPerKwh:C.price_eur_per_kwh}))),i&&i.count>0){const{getPVHistory:C}=await me(async()=>{const{getPVHistory:I}=await import("./index-BuosndfI.js").then(X=>X.bz);return{getPVHistory:I}},__vite__mapDeps([0,1])),E=await C(i.systems[0].system_id);E&&(f.value=E.readings.map(I=>({timestamp:I.timestamp,pvPower_kW:I.power_kw,irradiance_w_m2:I.irradiance_w_m2})))}($||i||n)&&(o.value=!0)}catch{}});const T=P([{id:"init",role:"assistant",content:"Hello! I am the FACIS AI Assistant. I can analyse energy consumption patterns, interpret IoT telemetry, explain anomalies, forecast PV output, and suggest cost optimisations. Select a quick prompt or ask me anything.",timestamp:new Date}]),N=P(""),R=P(!1),Q=P(null),Z=P(!1),J=P("forecast"),re=P("gpt-4.1-mini"),l=[{label:"GPT-4.1 Mini",value:"gpt-4.1-mini"}],v=P("24h"),L=[{label:"24h",value:"24h"},{label:"7d",value:"7d"},{label:"30d",value:"30d"}],V=ne(()=>{const $=Number(m.value)||0,i=Number(p.value)||0,n=Number(s.value)||.12,u=Math.max(0,$-i),C=u*24*n;return[{label:"Net Grid Import",value:u.toFixed(1),unit:"kW",trend:"stable",icon:"pi-arrow-down-left",color:"#3b82f6"},{label:"PV Generation",value:i.toFixed(1),unit:"kW",trend:"up",trendValue:o.value?"Live":"",icon:"pi-sun",color:"#f59e0b"},{label:"Daily Cost Est.",value:`€${C.toFixed(0)}`,unit:"",trend:"down",trendValue:o.value?"Live":"",icon:"pi-euro",color:"#22c55e"},{label:"Anomalies (24h)",value:"--",unit:"",trend:"stable",icon:"pi-exclamation-triangle",color:"#ef4444"}]}),O=[{key:"energy-summary",label:"Energy Summary",icon:"pi-bolt"},{key:"pv-forecast",label:"PV Forecast",icon:"pi-sun"},{key:"anomaly-report",label:"Anomaly Check",icon:"pi-exclamation-triangle"},{key:"city-status",label:"City Events",icon:"pi-map-marker"},{key:"cost-optimization",label:"Cost Optimisation",icon:"pi-chart-line"},{key:"lighting-analysis",label:"Lighting Analysis",icon:"pi-lightbulb"}];async function U($){var ye;const i=Number(m.value)||0,n=Number(p.value)||0,u=Number(s.value)||0,C=Math.max(0,i-n),E=C*24*u,I=i>0?(n/i*100).toFixed(1):"0",{getMeterHistory:X,getPriceForecast:Y,getStreetlights:ie,getStreetlightCurrent:K,getTrafficZones:A,getTrafficCurrent:he,getCityEvents:ce,getCityEventCurrent:ve,getCityWeatherCurrent:ge}=await me(async()=>{const{getMeterHistory:d,getPriceForecast:c,getStreetlights:a,getStreetlightCurrent:h,getTrafficZones:x,getTrafficCurrent:_,getCityEvents:g,getCityEventCurrent:F,getCityWeatherCurrent:B}=await import("./index-BuosndfI.js").then(ue=>ue.bz);return{getMeterHistory:d,getPriceForecast:c,getStreetlights:a,getStreetlightCurrent:h,getTrafficZones:x,getTrafficCurrent:_,getCityEvents:g,getCityEventCurrent:F,getCityWeatherCurrent:B}},__vite__mapDeps([0,1])),w=$.toLowerCase();if(w.includes("energy")||w.includes("consumption")||w.includes("kw")||w.includes("meter")||w.includes("summary")){const d=await X("meter-001"),c=(d==null?void 0:d.readings)??[],a=c.reduce((x,_)=>{var g,F,B;return x+(((g=_.readings)==null?void 0:g.active_power_l1_w)+((F=_.readings)==null?void 0:F.active_power_l2_w)+((B=_.readings)==null?void 0:B.active_power_l3_w)||0)/1e3*.25},0),h=c.reduce((x,_)=>{var g,F,B;return Math.max(x,(((g=_.readings)==null?void 0:g.active_power_l1_w)+((F=_.readings)==null?void 0:F.active_power_l2_w)+((B=_.readings)==null?void 0:B.active_power_l3_w)||0)/1e3)},0);return{text:`Based on the last 24 hours of live telemetry from **${b.value}** meter(s), total consumption was **${a.toFixed(0)} kWh** with PV generation contributing **${(n*24*.6).toFixed(0)} kWh** (${I}% self-sufficiency). Current active power is **${i.toFixed(1)} kW**. Peak demand was **${h.toFixed(1)} kW**. Current spot price: **€${u.toFixed(3)}/kWh**.`,insightCard:{findings:[`Live consumption: ${a.toFixed(0)} kWh over 24h`,`Current power: ${i.toFixed(1)} kW across ${b.value} meter(s)`,`Peak demand: ${h.toFixed(1)} kW`,`PV self-sufficiency: ${I}%`,`Current spot price: €${u.toFixed(3)}/kWh`],recommendations:[`Net grid import is ${C.toFixed(1)} kW — consider shifting loads to PV-peak hours`,`Estimated daily cost at current rate: €${E.toFixed(0)}`]}}}if(w.includes("pv")||w.includes("solar")||w.includes("forecast")||w.includes("irradiance")){const d=await Y(),c=(d==null?void 0:d.forecast)??[];return{text:`Current PV generation: **${n.toFixed(1)} kW**. Based on the 24h price forecast (${c.length} data points), the optimal self-consumption window is during the highest-price hours. Current irradiance conditions suggest ${n>1?"active generation":"low/no generation (nighttime or overcast)"}.

Price forecast range: **€${c.length>0?Math.min(...c.map(a=>a.price_eur_per_kwh)).toFixed(3):"?"}** to **€${c.length>0?Math.max(...c.map(a=>a.price_eur_per_kwh)).toFixed(3):"?"}/kWh**.`,insightCard:{findings:[`Current PV output: ${n.toFixed(1)} kW`,`${c.length} forecast price points available`,`Price range: €${c.length>0?Math.min(...c.map(a=>a.price_eur_per_kwh)).toFixed(3):"?"} – €${c.length>0?Math.max(...c.map(a=>a.price_eur_per_kwh)).toFixed(3):"?"}/kWh`],recommendations:[`${n>1?"Maximise self-consumption during current generation window":"PV not generating — schedule loads for next solar window"}`,"Monitor forecast for optimal battery charging times"]}}}if(w.includes("anomaly")||w.includes("anomali")||w.includes("spike")||w.includes("fault")){const d=await X("meter-001"),c=(d==null?void 0:d.readings)??[],a=c.map(g=>{var F,B,ue;return((((F=g.readings)==null?void 0:F.active_power_l1_w)??0)+(((B=g.readings)==null?void 0:B.active_power_l2_w)??0)+(((ue=g.readings)==null?void 0:ue.active_power_l3_w)??0))/1e3}),h=a.length>0?a.reduce((g,F)=>g+F,0)/a.length:0,x=a.length>0?Math.sqrt(a.reduce((g,F)=>g+(F-h)**2,0)/a.length):0,_=a.filter(g=>Math.abs(g-h)>2*x).length;return{text:`Anomaly scan of **${c.length}** readings from meter-001 over the last 24 hours:

Mean power: **${h.toFixed(1)} kW**, Standard deviation: **${x.toFixed(2)} kW**.

**${_}** reading(s) exceed the 2σ threshold (±${(2*x).toFixed(1)} kW from mean). ${_===0?"No significant anomalies detected — system operating within normal parameters.":`${_} anomalous reading(s) detected — review the power history chart for details.`}`,insightCard:{findings:[`${c.length} readings analysed from meter-001`,`Mean: ${h.toFixed(1)} kW, Std Dev: ${x.toFixed(2)} kW`,`2σ threshold: ±${(2*x).toFixed(1)} kW`,`Anomalies detected: ${_}`],recommendations:_>0?["Review power history chart for anomaly timestamps","Check device schedules during anomaly periods"]:["No action required — all readings within normal range"]}}}if(w.includes("city")||w.includes("event")){const d=await A(),c=await ce(),a=await ge(),h=(d==null?void 0:d.count)??0,x=(c==null?void 0:c.count)??0,_=(a==null?void 0:a.visibility)??"unknown",g=Number((a==null?void 0:a.fog_index)??0).toFixed(1),F=(a==null?void 0:a.sunrise_time)??"--:--",B=(a==null?void 0:a.sunset_time)??"--:--";return{text:`Smart City status: **${h}** traffic zone(s) monitored, **${x}** event zone(s) active. Current visibility: **${_}** (fog index: ${g}%). Sunrise: ${F}, Sunset: ${B}.`,insightCard:{findings:[`${h} traffic zones monitored`,`${x} event zones`,`Visibility: ${_} (fog: ${g}%)`,`Sunrise: ${F}, Sunset: ${B}`],recommendations:["Monitor traffic zones for congestion patterns","Adjust lighting schedules based on sunrise/sunset times"]}}}if(w.includes("cost")||w.includes("saving")||w.includes("price")||w.includes("tariff")||w.includes("optimi")){const d=await Y(),c=(d==null?void 0:d.forecast)??[],a=c.length>0?Math.min(...c.map(g=>g.price_eur_per_kwh)):0,h=c.length>0?Math.max(...c.map(g=>g.price_eur_per_kwh)):0,x=(h-a)*C*24,_=c.filter(g=>g.price_eur_per_kwh<(a+h)/2).map(g=>new Date(g.timestamp).getHours()).slice(0,4);return{text:`Analysing the ENTSO-E spot price forecast alongside your current load of **${C.toFixed(1)} kW** net grid import:

- Price range: **€${a.toFixed(3)}/kWh** to **€${h.toFixed(3)}/kWh** (spread: €${(h-a).toFixed(3)}/kWh)
- Estimated savings from load shifting: **€${x.toFixed(0)}/day**
- Cheapest hours: **${_.map(g=>`${g}:00`).join(", ")}**
- Current rate: **€${u.toFixed(3)}/kWh** (${u>(a+h)/2?"above average":"below average"})`,insightCard:{findings:[`Current price: €${u.toFixed(3)}/kWh`,`24h range: €${a.toFixed(3)} – €${h.toFixed(3)}/kWh`,`Net grid import: ${C.toFixed(1)} kW`,`Estimated daily cost: €${E.toFixed(0)}`],recommendations:[`Shift deferrable loads to ${_.map(g=>`${g}:00`).join(", ")}`,`Potential savings: €${x.toFixed(0)}/day from load shifting`,`Current rate is ${u>(a+h)/2?"above":"below"} average — ${u>(a+h)/2?"defer non-essential loads":"good time to run high-power equipment"}`]}}}if(w.includes("light")||w.includes("dali")||w.includes("luminar")||w.includes("dimm")){const d=await ie(),c=(d==null?void 0:d.count)??0,a=new Set(((ye=d==null?void 0:d.streetlights)==null?void 0:ye.map(x=>x.zone_id))??[]);let h=0;if(d!=null&&d.streetlights)for(const x of d.streetlights.slice(0,10)){const _=await K(x.light_id);_&&(h+=_.power_w)}return{text:`Smart Lighting status: **${c}** luminaire(s) across **${a.size}** zone(s). Current total lighting power: **${(h/1e3).toFixed(2)} kW** (${h.toFixed(0)} W). Estimated 24h consumption at current levels: **${(h/1e3*24).toFixed(1)} kWh**.`,insightCard:{findings:[`${c} luminaires across ${a.size} zones`,`Current power: ${h.toFixed(0)} W (${(h/1e3).toFixed(2)} kW)`,`Est. 24h consumption: ${(h/1e3*24).toFixed(1)} kWh`],recommendations:["Review dimming schedules for energy optimisation","Monitor zone-level efficiency ratios"]}}}return{text:`Based on current platform telemetry: **${b.value}** meter(s) reporting, active power **${i.toFixed(1)} kW**, PV generation **${n.toFixed(1)} kW**, current price **€${u.toFixed(3)}/kWh**. Net grid import: **${C.toFixed(1)} kW**. Estimated daily cost: **€${E.toFixed(0)}**.

Ask about energy consumption, PV forecasts, anomaly detection, cost optimisation, city events, or lighting analysis.`,insightCard:void 0}}let M=null;async function W($,i){const n=($??N.value).trim();if(!(!n||R.value)){if(M=i??null,T.value.push({id:Date.now().toString(),role:"user",content:n,timestamp:new Date}),N.value="",R.value=!0,await ke(),le(),t.isAvailable)try{let u;if(M){const C=Date.now();u=await t.requestInsight(M,{start_ts:C-864e5,end_ts:C},n)}else u=await t.requestLlm(n);T.value.push({id:(Date.now()+1).toString(),role:"assistant",content:u,timestamp:new Date})}catch{const u=await U(n);T.value.push({id:(Date.now()+1).toString(),role:"assistant",content:u.text,timestamp:new Date,insightCard:u.insightCard})}else{const{postInsightEnergySummary:u,postInsightAnomalyReport:C,postInsightCityStatus:E}=await me(async()=>{const{postInsightEnergySummary:he,postInsightAnomalyReport:ce,postInsightCityStatus:ve}=await import("./index-BuosndfI.js").then(ge=>ge.bz);return{postInsightEnergySummary:he,postInsightAnomalyReport:ce,postInsightCityStatus:ve}},__vite__mapDeps([0,1])),I=new Date,X=v.value==="30d"?30*864e5:v.value==="7d"?7*864e5:864e5,Y=new Date(I.getTime()-X).toISOString(),ie=I.toISOString();let K=null;const A=n.toLowerCase();M==="anomaly-report"||A.includes("anomaly")||A.includes("anomali")||A.includes("spike")||A.includes("fault")?K=await C(Y,ie):M==="city-status"||M==="lighting-analysis"||A.includes("city")||A.includes("event")||A.includes("lighting")||A.includes("zone")||A.includes("dali")||A.includes("luminar")||A.includes("dimm")||A.includes("traffic")?K=await E(Y,ie):K=await u(Y,ie),K&&K.summary?T.value.push({id:(Date.now()+1).toString(),role:"assistant",content:K.summary,timestamp:new Date,insightCard:{findings:K.key_findings||[],recommendations:K.recommendations||[]}}):T.value.push({id:(Date.now()+1).toString(),role:"assistant",content:"The AI Insight service did not return a response. The Trino Gold layer may not have data for the requested time window. Please try again.",timestamp:new Date})}R.value=!1,await ke(),le()}}function q($){const i=O.find(n=>n.key===$);i&&W(i.label,$)}function le(){Q.value&&(Q.value.scrollTop=Q.value.scrollHeight)}function We($){return $.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>").replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>").replace(/^/,"<p>").replace(/$/,"</p>")}const Ae=ne(()=>(o.value&&f.value.length>0?f.value:[]).slice(-24).map(i=>{const n=new Date(i.timestamp).getHours();return`${String(n).padStart(2,"0")}:00`})),Oe=ne(()=>{const i=(o.value&&f.value.length>0?f.value:[]).slice(-24);return[{label:"PV Power (kW)",data:i.map(n=>Math.round(n.pvPower_kW*10)/10),borderColor:"#f59e0b",backgroundColor:"rgba(245,158,11,0.1)",fill:!0,tension:.4},{label:"Irradiance (W/m² ÷10)",data:i.map(n=>Math.round(n.irradiance_w_m2/10)/10),borderColor:"#fbbf24",tension:.4}]}),Ee=ne(()=>[{label:"Price (€/kWh)",data:(o.value&&S.value.length>0?S.value:[]).map(i=>Math.round(i.priceEurPerKwh*1e3)/1e3),borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,0.07)",fill:!0,tension:.4}]),Be=ne(()=>(o.value&&S.value.length>0?S.value:[]).map(i=>{const n=new Date(i.timestamp).getHours();return`${String(n).padStart(2,"0")}:00`}));return($,i)=>(y(),k("div",Ft,[H(it,{title:"AI Assistant",subtitle:"Natural language interface to platform data, insights, and optimisation recommendations",breadcrumbs:[{label:"AI Assistant"}]}),r("div",Tt,[r("div",It,[r("div",Lt,[r("div",Vt,[H(ee(ot),{modelValue:re.value,"onUpdate:modelValue":i[0]||(i[0]=n=>re.value=n),options:l,"option-label":"label","option-value":"value",size:"small",class:"llm-select"},null,8,["modelValue"]),H(ee(Ve),{modelValue:v.value,"onUpdate:modelValue":i[1]||(i[1]=n=>v.value=n),options:L,"option-label":"label","option-value":"value",size:"small"},null,8,["modelValue"]),r("span",{class:j(["uib-status",o.value?"uib-status--live":"uib-status--demo"])},[i[6]||(i[6]=r("span",{class:"uib-status__dot"},null,-1)),te(" "+D(o.value?"Live Data":ee(t).connected?"Live (Node-RED)":"Simulation API"),1)],2)]),H(ee(_e),{icon:Z.value?"pi pi-chevron-right":"pi pi-chart-bar",label:Z.value?"Hide Charts":"Show Charts",text:"",size:"small",onClick:i[2]||(i[2]=n=>Z.value=!Z.value)},null,8,["icon","label"])]),r("div",Wt,[(y(!0),k(z,null,G(V.value,n=>(y(),k("div",{key:n.label,class:"ck-item"},[r("span",At,[te(D(n.value)+" ",1),r("span",Ot,D(n.unit),1)]),r("span",Et,D(n.label),1)]))),128))]),r("div",Bt,[(y(),k(z,null,G(O,n=>r("button",{key:n.key,class:"prompt-btn",disabled:R.value,onClick:u=>q(n.key)},[r("i",{class:j(`pi ${n.icon}`)},null,2),te(" "+D(n.label),1)],8,Dt)),64))]),r("div",{ref_key:"chatContainer",ref:Q,class:"chat-messages"},[(y(!0),k(z,null,G(T.value,n=>(y(),k("div",{key:n.id,class:j(["chat-message",`chat-message--${n.role}`])},[r("div",Mt,[r("i",{class:j(n.role==="user"?"pi pi-user":"pi pi-sparkles")},null,2)]),r("div",zt,[r("div",{class:j(["chat-message__bubble",{"chat-message__bubble--user":n.role==="user"}])},[n.role==="assistant"?(y(),k("div",{key:0,class:"chat-message__content",innerHTML:We(n.content)},null,8,Rt)):(y(),k("div",Kt,D(n.content),1)),n.insightCard?(y(),k("div",Nt,[r("div",qt,[i[7]||(i[7]=r("div",{class:"ic-title"},[r("i",{class:"pi pi-search"}),te(" Findings ")],-1)),r("ul",Ht,[(y(!0),k(z,null,G(n.insightCard.findings,u=>(y(),k("li",{key:u},D(u),1))),128))])]),r("div",Ut,[i[8]||(i[8]=r("div",{class:"ic-title"},[r("i",{class:"pi pi-lightbulb"}),te(" Recommendations ")],-1)),r("ul",jt,[(y(!0),k(z,null,G(n.insightCard.recommendations,u=>(y(),k("li",{key:u},D(u),1))),128))])])])):ae("",!0),r("div",Gt,D(n.timestamp.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})),1)],2)])],2))),128)),R.value?(y(),k("div",Zt,[...i[9]||(i[9]=[Xe('<div class="chat-message__avatar typing-avatar" data-v-69627352><i class="pi pi-sparkles" data-v-69627352></i></div><div class="chat-message__wrap" data-v-69627352><div class="chat-message__bubble typing-bubble" data-v-69627352><span class="typing-dot" data-v-69627352></span><span class="typing-dot" data-v-69627352></span><span class="typing-dot" data-v-69627352></span></div></div>',2)])])):ae("",!0)],512),r("div",Jt,[H(ee(et),{modelValue:N.value,"onUpdate:modelValue":i[3]||(i[3]=n=>N.value=n),placeholder:"Ask about your IoT data, anomalies, cost optimisations, or forecasts...",class:"chat-input",disabled:R.value,onKeyup:i[4]||(i[4]=Ye(n=>W(),["enter"]))},null,8,["modelValue","disabled"]),H(ee(_e),{icon:"pi pi-send",disabled:!N.value.trim()||R.value,loading:R.value,onClick:i[5]||(i[5]=n=>W())},null,8,["disabled","loading"])])]),H(tt,{name:"slide-right"},{default:Te(()=>[Z.value?(y(),k("div",Qt,[r("div",Xt,[(y(),k(z,null,G([{key:"forecast",label:"24h Forecast",icon:"pi-sun"},{key:"cost",label:"Cost Trend",icon:"pi-euro"},{key:"kpis",label:"KPIs",icon:"pi-chart-bar"}],n=>r("button",{key:n.key,class:j(["cpt-btn",{"cpt-btn--active":J.value===n.key}]),onClick:u=>J.value=n.key},[r("i",{class:j(`pi ${n.icon}`)},null,2),te(" "+D(n.label),1)],10,Yt)),64))]),r("div",en,[J.value==="forecast"?(y(),k(z,{key:0},[i[10]||(i[10]=r("div",{class:"cp-title"},"PV Generation — Last 24h",-1)),H($e,{datasets:Oe.value,labels:Ae.value,"y-axis-label":"kW",height:220},null,8,["datasets","labels"])],64)):J.value==="cost"?(y(),k(z,{key:1},[i[11]||(i[11]=r("div",{class:"cp-title"},"Spot Price — Last 24h",-1)),H($e,{datasets:Ee.value,labels:Be.value,"y-axis-label":"€/kWh",height:220},null,8,["datasets","labels"])],64)):J.value==="kpis"?(y(),k(z,{key:2},[i[12]||(i[12]=r("div",{class:"cp-title"},"Current Platform KPIs",-1)),r("div",tn,[(y(!0),k(z,null,G(V.value,n=>(y(),Fe(at,{key:n.label,label:n.label,value:n.value,unit:n.unit,trend:n.trend,"trend-value":n.trendValue,icon:n.icon,color:n.color},null,8,["label","value","unit","trend","trend-value","icon","color"]))),128))])],64)):ae("",!0)])])):ae("",!0)]),_:1})])]))}}),un=nt(nn,[["__scopeId","data-v-69627352"]]);export{un as default};
