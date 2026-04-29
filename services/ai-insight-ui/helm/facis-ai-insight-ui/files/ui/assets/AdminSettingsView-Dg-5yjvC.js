import{E as L,a$ as R,a4 as j,o as u,c as f,a as n,L as c,M as v,a2 as N,R as M,G as F,y as K,B as W,m as V,w as S,v as q,N as G,z as P,A as Y,T as E,d as H,b as r,e as d,s as k,p as Q,t as p,D as m,b2 as I,r as U,h as Z}from"./index-tiB6a_GP.js";import{s as A}from"./index-Ooo4OZAf.js";import{P as J}from"./PageHeader-C4RZMKxe.js";var X=`
    .p-toggleswitch {
        display: inline-block;
        width: dt('toggleswitch.width');
        height: dt('toggleswitch.height');
    }

    .p-toggleswitch-input {
        cursor: pointer;
        appearance: none;
        position: absolute;
        top: 0;
        inset-inline-start: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        margin: 0;
        opacity: 0;
        z-index: 1;
        outline: 0 none;
        border-radius: dt('toggleswitch.border.radius');
    }

    .p-toggleswitch-slider {
        cursor: pointer;
        width: 100%;
        height: 100%;
        border-width: dt('toggleswitch.border.width');
        border-style: solid;
        border-color: dt('toggleswitch.border.color');
        background: dt('toggleswitch.background');
        transition:
            background dt('toggleswitch.transition.duration'),
            color dt('toggleswitch.transition.duration'),
            border-color dt('toggleswitch.transition.duration'),
            outline-color dt('toggleswitch.transition.duration'),
            box-shadow dt('toggleswitch.transition.duration');
        border-radius: dt('toggleswitch.border.radius');
        outline-color: transparent;
        box-shadow: dt('toggleswitch.shadow');
    }

    .p-toggleswitch-handle {
        position: absolute;
        top: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: dt('toggleswitch.handle.background');
        color: dt('toggleswitch.handle.color');
        width: dt('toggleswitch.handle.size');
        height: dt('toggleswitch.handle.size');
        inset-inline-start: dt('toggleswitch.gap');
        margin-block-start: calc(-1 * calc(dt('toggleswitch.handle.size') / 2));
        border-radius: dt('toggleswitch.handle.border.radius');
        transition:
            background dt('toggleswitch.transition.duration'),
            color dt('toggleswitch.transition.duration'),
            inset-inline-start dt('toggleswitch.slide.duration'),
            box-shadow dt('toggleswitch.slide.duration');
    }

    .p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-slider {
        background: dt('toggleswitch.checked.background');
        border-color: dt('toggleswitch.checked.border.color');
    }

    .p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-handle {
        background: dt('toggleswitch.handle.checked.background');
        color: dt('toggleswitch.handle.checked.color');
        inset-inline-start: calc(dt('toggleswitch.width') - calc(dt('toggleswitch.handle.size') + dt('toggleswitch.gap')));
    }

    .p-toggleswitch:not(.p-disabled):has(.p-toggleswitch-input:hover) .p-toggleswitch-slider {
        background: dt('toggleswitch.hover.background');
        border-color: dt('toggleswitch.hover.border.color');
    }

    .p-toggleswitch:not(.p-disabled):has(.p-toggleswitch-input:hover) .p-toggleswitch-handle {
        background: dt('toggleswitch.handle.hover.background');
        color: dt('toggleswitch.handle.hover.color');
    }

    .p-toggleswitch:not(.p-disabled):has(.p-toggleswitch-input:hover).p-toggleswitch-checked .p-toggleswitch-slider {
        background: dt('toggleswitch.checked.hover.background');
        border-color: dt('toggleswitch.checked.hover.border.color');
    }

    .p-toggleswitch:not(.p-disabled):has(.p-toggleswitch-input:hover).p-toggleswitch-checked .p-toggleswitch-handle {
        background: dt('toggleswitch.handle.checked.hover.background');
        color: dt('toggleswitch.handle.checked.hover.color');
    }

    .p-toggleswitch:not(.p-disabled):has(.p-toggleswitch-input:focus-visible) .p-toggleswitch-slider {
        box-shadow: dt('toggleswitch.focus.ring.shadow');
        outline: dt('toggleswitch.focus.ring.width') dt('toggleswitch.focus.ring.style') dt('toggleswitch.focus.ring.color');
        outline-offset: dt('toggleswitch.focus.ring.offset');
    }

    .p-toggleswitch.p-invalid > .p-toggleswitch-slider {
        border-color: dt('toggleswitch.invalid.border.color');
    }

    .p-toggleswitch.p-disabled {
        opacity: 1;
    }

    .p-toggleswitch.p-disabled .p-toggleswitch-slider {
        background: dt('toggleswitch.disabled.background');
    }

    .p-toggleswitch.p-disabled .p-toggleswitch-handle {
        background: dt('toggleswitch.handle.disabled.background');
    }
`,_={root:{position:"relative"}},ee={root:function(t){var o=t.instance,a=t.props;return["p-toggleswitch p-component",{"p-toggleswitch-checked":o.checked,"p-disabled":a.disabled,"p-invalid":o.$invalid}]},input:"p-toggleswitch-input",slider:"p-toggleswitch-slider",handle:"p-toggleswitch-handle"},se=L.extend({name:"toggleswitch",style:X,classes:ee,inlineStyles:_}),ne={name:"BaseToggleSwitch",extends:R,props:{trueValue:{type:null,default:!0},falseValue:{type:null,default:!1},readonly:{type:Boolean,default:!1},tabindex:{type:Number,default:null},inputId:{type:String,default:null},inputClass:{type:[String,Object],default:null},inputStyle:{type:Object,default:null},ariaLabelledby:{type:String,default:null},ariaLabel:{type:String,default:null}},style:se,provide:function(){return{$pcToggleSwitch:this,$parentInstance:this}}},b={name:"ToggleSwitch",extends:ne,inheritAttrs:!1,emits:["change","focus","blur"],methods:{getPTOptions:function(t){var o=t==="root"?this.ptmi:this.ptm;return o(t,{context:{checked:this.checked,disabled:this.disabled}})},onChange:function(t){if(!this.disabled&&!this.readonly){var o=this.checked?this.falseValue:this.trueValue;this.writeValue(o,t),this.$emit("change",t)}},onFocus:function(t){this.$emit("focus",t)},onBlur:function(t){var o,a;this.$emit("blur",t),(o=(a=this.formField).onBlur)===null||o===void 0||o.call(a,t)}},computed:{checked:function(){return this.d_value===this.trueValue},dataP:function(){return j({checked:this.checked,disabled:this.disabled,invalid:this.$invalid})}}},te=["data-p-checked","data-p-disabled","data-p"],oe=["id","checked","tabindex","disabled","readonly","aria-checked","aria-labelledby","aria-label","aria-invalid"],ae=["data-p"],le=["data-p"];function ie(e,t,o,a,g,l){return u(),f("div",c({class:e.cx("root"),style:e.sx("root")},l.getPTOptions("root"),{"data-p-checked":l.checked,"data-p-disabled":e.disabled,"data-p":l.dataP}),[n("input",c({id:e.inputId,type:"checkbox",role:"switch",class:[e.cx("input"),e.inputClass],style:e.inputStyle,checked:l.checked,tabindex:e.tabindex,disabled:e.disabled,readonly:e.readonly,"aria-checked":l.checked,"aria-labelledby":e.ariaLabelledby,"aria-label":e.ariaLabel,"aria-invalid":e.invalid||void 0,onFocus:t[0]||(t[0]=function(){return l.onFocus&&l.onFocus.apply(l,arguments)}),onBlur:t[1]||(t[1]=function(){return l.onBlur&&l.onBlur.apply(l,arguments)}),onChange:t[2]||(t[2]=function(){return l.onChange&&l.onChange.apply(l,arguments)})},l.getPTOptions("input")),null,16,oe),n("div",c({class:e.cx("slider")},l.getPTOptions("slider"),{"data-p":l.dataP}),[n("div",c({class:e.cx("handle")},l.getPTOptions("handle"),{"data-p":l.dataP}),[v(e.$slots,"handle",{checked:l.checked})],16,le)],16,ae)],16,te)}b.render=ie;var re=`
    .p-message {
        display: grid;
        grid-template-rows: 1fr;
        border-radius: dt('message.border.radius');
        outline-width: dt('message.border.width');
        outline-style: solid;
    }

    .p-message-content-wrapper {
        min-height: 0;
    }

    .p-message-content {
        display: flex;
        align-items: center;
        padding: dt('message.content.padding');
        gap: dt('message.content.gap');
    }

    .p-message-icon {
        flex-shrink: 0;
    }

    .p-message-close-button {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-inline-start: auto;
        overflow: hidden;
        position: relative;
        width: dt('message.close.button.width');
        height: dt('message.close.button.height');
        border-radius: dt('message.close.button.border.radius');
        background: transparent;
        transition:
            background dt('message.transition.duration'),
            color dt('message.transition.duration'),
            outline-color dt('message.transition.duration'),
            box-shadow dt('message.transition.duration'),
            opacity 0.3s;
        outline-color: transparent;
        color: inherit;
        padding: 0;
        border: none;
        cursor: pointer;
        user-select: none;
    }

    .p-message-close-icon {
        font-size: dt('message.close.icon.size');
        width: dt('message.close.icon.size');
        height: dt('message.close.icon.size');
    }

    .p-message-close-button:focus-visible {
        outline-width: dt('message.close.button.focus.ring.width');
        outline-style: dt('message.close.button.focus.ring.style');
        outline-offset: dt('message.close.button.focus.ring.offset');
    }

    .p-message-info {
        background: dt('message.info.background');
        outline-color: dt('message.info.border.color');
        color: dt('message.info.color');
        box-shadow: dt('message.info.shadow');
    }

    .p-message-info .p-message-close-button:focus-visible {
        outline-color: dt('message.info.close.button.focus.ring.color');
        box-shadow: dt('message.info.close.button.focus.ring.shadow');
    }

    .p-message-info .p-message-close-button:hover {
        background: dt('message.info.close.button.hover.background');
    }

    .p-message-info.p-message-outlined {
        color: dt('message.info.outlined.color');
        outline-color: dt('message.info.outlined.border.color');
    }

    .p-message-info.p-message-simple {
        color: dt('message.info.simple.color');
    }

    .p-message-success {
        background: dt('message.success.background');
        outline-color: dt('message.success.border.color');
        color: dt('message.success.color');
        box-shadow: dt('message.success.shadow');
    }

    .p-message-success .p-message-close-button:focus-visible {
        outline-color: dt('message.success.close.button.focus.ring.color');
        box-shadow: dt('message.success.close.button.focus.ring.shadow');
    }

    .p-message-success .p-message-close-button:hover {
        background: dt('message.success.close.button.hover.background');
    }

    .p-message-success.p-message-outlined {
        color: dt('message.success.outlined.color');
        outline-color: dt('message.success.outlined.border.color');
    }

    .p-message-success.p-message-simple {
        color: dt('message.success.simple.color');
    }

    .p-message-warn {
        background: dt('message.warn.background');
        outline-color: dt('message.warn.border.color');
        color: dt('message.warn.color');
        box-shadow: dt('message.warn.shadow');
    }

    .p-message-warn .p-message-close-button:focus-visible {
        outline-color: dt('message.warn.close.button.focus.ring.color');
        box-shadow: dt('message.warn.close.button.focus.ring.shadow');
    }

    .p-message-warn .p-message-close-button:hover {
        background: dt('message.warn.close.button.hover.background');
    }

    .p-message-warn.p-message-outlined {
        color: dt('message.warn.outlined.color');
        outline-color: dt('message.warn.outlined.border.color');
    }

    .p-message-warn.p-message-simple {
        color: dt('message.warn.simple.color');
    }

    .p-message-error {
        background: dt('message.error.background');
        outline-color: dt('message.error.border.color');
        color: dt('message.error.color');
        box-shadow: dt('message.error.shadow');
    }

    .p-message-error .p-message-close-button:focus-visible {
        outline-color: dt('message.error.close.button.focus.ring.color');
        box-shadow: dt('message.error.close.button.focus.ring.shadow');
    }

    .p-message-error .p-message-close-button:hover {
        background: dt('message.error.close.button.hover.background');
    }

    .p-message-error.p-message-outlined {
        color: dt('message.error.outlined.color');
        outline-color: dt('message.error.outlined.border.color');
    }

    .p-message-error.p-message-simple {
        color: dt('message.error.simple.color');
    }

    .p-message-secondary {
        background: dt('message.secondary.background');
        outline-color: dt('message.secondary.border.color');
        color: dt('message.secondary.color');
        box-shadow: dt('message.secondary.shadow');
    }

    .p-message-secondary .p-message-close-button:focus-visible {
        outline-color: dt('message.secondary.close.button.focus.ring.color');
        box-shadow: dt('message.secondary.close.button.focus.ring.shadow');
    }

    .p-message-secondary .p-message-close-button:hover {
        background: dt('message.secondary.close.button.hover.background');
    }

    .p-message-secondary.p-message-outlined {
        color: dt('message.secondary.outlined.color');
        outline-color: dt('message.secondary.outlined.border.color');
    }

    .p-message-secondary.p-message-simple {
        color: dt('message.secondary.simple.color');
    }

    .p-message-contrast {
        background: dt('message.contrast.background');
        outline-color: dt('message.contrast.border.color');
        color: dt('message.contrast.color');
        box-shadow: dt('message.contrast.shadow');
    }

    .p-message-contrast .p-message-close-button:focus-visible {
        outline-color: dt('message.contrast.close.button.focus.ring.color');
        box-shadow: dt('message.contrast.close.button.focus.ring.shadow');
    }

    .p-message-contrast .p-message-close-button:hover {
        background: dt('message.contrast.close.button.hover.background');
    }

    .p-message-contrast.p-message-outlined {
        color: dt('message.contrast.outlined.color');
        outline-color: dt('message.contrast.outlined.border.color');
    }

    .p-message-contrast.p-message-simple {
        color: dt('message.contrast.simple.color');
    }

    .p-message-text {
        font-size: dt('message.text.font.size');
        font-weight: dt('message.text.font.weight');
    }

    .p-message-icon {
        font-size: dt('message.icon.size');
        width: dt('message.icon.size');
        height: dt('message.icon.size');
    }

    .p-message-sm .p-message-content {
        padding: dt('message.content.sm.padding');
    }

    .p-message-sm .p-message-text {
        font-size: dt('message.text.sm.font.size');
    }

    .p-message-sm .p-message-icon {
        font-size: dt('message.icon.sm.size');
        width: dt('message.icon.sm.size');
        height: dt('message.icon.sm.size');
    }

    .p-message-sm .p-message-close-icon {
        font-size: dt('message.close.icon.sm.size');
        width: dt('message.close.icon.sm.size');
        height: dt('message.close.icon.sm.size');
    }

    .p-message-lg .p-message-content {
        padding: dt('message.content.lg.padding');
    }

    .p-message-lg .p-message-text {
        font-size: dt('message.text.lg.font.size');
    }

    .p-message-lg .p-message-icon {
        font-size: dt('message.icon.lg.size');
        width: dt('message.icon.lg.size');
        height: dt('message.icon.lg.size');
    }

    .p-message-lg .p-message-close-icon {
        font-size: dt('message.close.icon.lg.size');
        width: dt('message.close.icon.lg.size');
        height: dt('message.close.icon.lg.size');
    }

    .p-message-outlined {
        background: transparent;
        outline-width: dt('message.outlined.border.width');
    }

    .p-message-simple {
        background: transparent;
        outline-color: transparent;
        box-shadow: none;
    }

    .p-message-simple .p-message-content {
        padding: dt('message.simple.content.padding');
    }

    .p-message-outlined .p-message-close-button:hover,
    .p-message-simple .p-message-close-button:hover {
        background: transparent;
    }

    .p-message-enter-active {
        animation: p-animate-message-enter 0.3s ease-out forwards;
        overflow: hidden;
    }

    .p-message-leave-active {
        animation: p-animate-message-leave 0.15s ease-in forwards;
        overflow: hidden;
    }

    @keyframes p-animate-message-enter {
        from {
            opacity: 0;
            grid-template-rows: 0fr;
        }
        to {
            opacity: 1;
            grid-template-rows: 1fr;
        }
    }

    @keyframes p-animate-message-leave {
        from {
            opacity: 1;
            grid-template-rows: 1fr;
        }
        to {
            opacity: 0;
            margin: 0;
            grid-template-rows: 0fr;
        }
    }
`,de={root:function(t){var o=t.props;return["p-message p-component p-message-"+o.severity,{"p-message-outlined":o.variant==="outlined","p-message-simple":o.variant==="simple","p-message-sm":o.size==="small","p-message-lg":o.size==="large"}]},contentWrapper:"p-message-content-wrapper",content:"p-message-content",icon:"p-message-icon",text:"p-message-text",closeButton:"p-message-close-button",closeIcon:"p-message-close-icon"},ce=L.extend({name:"message",style:re,classes:de}),ge={name:"BaseMessage",extends:F,props:{severity:{type:String,default:"info"},closable:{type:Boolean,default:!1},life:{type:Number,default:null},icon:{type:String,default:void 0},closeIcon:{type:String,default:void 0},closeButtonProps:{type:null,default:null},size:{type:String,default:null},variant:{type:String,default:null}},style:ce,provide:function(){return{$pcMessage:this,$parentInstance:this}}};function w(e){"@babel/helpers - typeof";return w=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},w(e)}function x(e,t,o){return(t=ue(t))in e?Object.defineProperty(e,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):e[t]=o,e}function ue(e){var t=pe(e,"string");return w(t)=="symbol"?t:t+""}function pe(e,t){if(w(e)!="object"||!e)return e;var o=e[Symbol.toPrimitive];if(o!==void 0){var a=o.call(e,t);if(w(a)!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}var D={name:"Message",extends:ge,inheritAttrs:!1,emits:["close","life-end"],timeout:null,data:function(){return{visible:!0}},mounted:function(){var t=this;this.life&&setTimeout(function(){t.visible=!1,t.$emit("life-end")},this.life)},methods:{close:function(t){this.visible=!1,this.$emit("close",t)}},computed:{closeAriaLabel:function(){return this.$primevue.config.locale.aria?this.$primevue.config.locale.aria.close:void 0},dataP:function(){return j(x(x({outlined:this.variant==="outlined",simple:this.variant==="simple"},this.severity,this.severity),this.size,this.size))}},directives:{ripple:M},components:{TimesIcon:N}};function y(e){"@babel/helpers - typeof";return y=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},y(e)}function C(e,t){var o=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(g){return Object.getOwnPropertyDescriptor(e,g).enumerable})),o.push.apply(o,a)}return o}function $(e){for(var t=1;t<arguments.length;t++){var o=arguments[t]!=null?arguments[t]:{};t%2?C(Object(o),!0).forEach(function(a){me(e,a,o[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(o)):C(Object(o)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(o,a))})}return e}function me(e,t,o){return(t=be(t))in e?Object.defineProperty(e,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):e[t]=o,e}function be(e){var t=fe(e,"string");return y(t)=="symbol"?t:t+""}function fe(e,t){if(y(e)!="object"||!e)return e;var o=e[Symbol.toPrimitive];if(o!==void 0){var a=o.call(e,t);if(y(a)!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}var he=["data-p"],ve=["data-p"],we=["data-p"],ye=["aria-label","data-p"],ke=["data-p"];function Ve(e,t,o,a,g,l){var z=K("TimesIcon"),T=W("ripple");return u(),V(E,c({name:"p-message",appear:""},e.ptmi("transition")),{default:S(function(){return[g.visible?(u(),f("div",c({key:0,class:e.cx("root"),role:"alert","aria-live":"assertive","aria-atomic":"true","data-p":l.dataP},e.ptm("root")),[n("div",c({class:e.cx("contentWrapper")},e.ptm("contentWrapper")),[e.$slots.container?v(e.$slots,"container",{key:0,closeCallback:l.close}):(u(),f("div",c({key:1,class:e.cx("content"),"data-p":l.dataP},e.ptm("content")),[v(e.$slots,"icon",{class:q(e.cx("icon"))},function(){return[(u(),V(G(e.icon?"span":null),c({class:[e.cx("icon"),e.icon],"data-p":l.dataP},e.ptm("icon")),null,16,["class","data-p"]))]}),e.$slots.default?(u(),f("div",c({key:0,class:e.cx("text"),"data-p":l.dataP},e.ptm("text")),[v(e.$slots,"default")],16,we)):P("",!0),e.closable?Y((u(),f("button",c({key:1,class:e.cx("closeButton"),"aria-label":l.closeAriaLabel,type:"button",onClick:t[0]||(t[0]=function(h){return l.close(h)}),"data-p":l.dataP},$($({},e.closeButtonProps),e.ptm("closeButton"))),[v(e.$slots,"closeicon",{},function(){return[e.closeIcon?(u(),f("i",c({key:0,class:[e.cx("closeIcon"),e.closeIcon],"data-p":l.dataP},e.ptm("closeIcon")),null,16,ke)):(u(),V(z,c({key:1,class:[e.cx("closeIcon"),e.closeIcon],"data-p":l.dataP},e.ptm("closeIcon")),null,16,["class","data-p"]))]})],16,ye)),[[T]]):P("",!0)],16,ve))],16)],16,he)):P("",!0)]}),_:3},16)}D.render=Ve;const Se={class:"view-page"},Pe={class:"view-body"},ze={class:"card card-body"},Te={class:"env-grid"},Be={class:"env-row"},Ie={class:"env-val"},Ae={class:"env-row"},Oe={class:"env-val env-badge env-badge--blue"},Ue={class:"env-row"},xe={class:"env-val env-mono"},Ce={class:"env-row"},$e={class:"env-val"},Le={class:"env-row"},je={class:"env-val env-badge env-badge--green"},Ee={class:"env-row"},De={class:"env-val"},Re={class:"env-row"},Ne={class:"env-val env-mono"},Me={class:"env-row"},Fe={class:"env-val env-mono"},Ke={class:"card card-body"},We={class:"toggles-grid"},qe={class:"toggle-row"},Ge={class:"toggle-row"},Ye={class:"toggle-row"},He={class:"toggle-row"},Qe={class:"toggle-row"},Ze={class:"toggle-row"},Je={class:"card card-body"},Xe={class:"settings-form"},_e={class:"sf-row"},es={class:"sf-row"},ss={class:"sf-row"},ns={class:"sf-row"},ts={class:"sf-row"},os={class:"sf-row"},as={class:"sf-row"},ls={class:"card card-body"},is={class:"settings-form"},rs={class:"sf-row"},ds={class:"sf-row"},cs={class:"sf-row"},gs={class:"settings-actions"},us=H({__name:"AdminSettingsView",setup(e){const t={name:"FACIS IoT & AI Platform",version:"1.4.0",buildDate:"2026-04-05",buildId:"2026.04.05.1",environment:"Production",region:"EU-West (Lisbon)",nodeVersion:"v20.12.0",vueVersion:"3.4.x"},o=I({aiAnalytics:!0,realtimeAlerts:!0,exportApi:!0,demoMode:!1,betaFeatures:!1,debugLogging:!1}),a=I({baseUrl:"/api",timeout:30,retries:3,keycloakUrl:"http://localhost:8180",keycloakRealm:"facis",mqttBroker:"mqtt://broker.facis.local:1883",kafkaBrokers:"kafka-1.facis.local:9092,kafka-2.facis.local:9092"}),g=I({timezone:"Europe/Lisbon",unitSystem:"metric",dateRange:"24h",numberLocale:"en-GB",language:"en"}),l=[{label:"Europe/Lisbon (UTC+1)",value:"Europe/Lisbon"},{label:"Europe/Berlin (UTC+2)",value:"Europe/Berlin"},{label:"UTC",value:"UTC"},{label:"America/New_York (UTC-4)",value:"America/New_York"}],z=[{label:"Metric (kWh, °C, m/s)",value:"metric"},{label:"Imperial (kWh, °F, mph)",value:"imperial"}],T=[{label:"Last 24 hours",value:"24h"},{label:"Last 7 days",value:"7d"},{label:"Last 30 days",value:"30d"}],h=U(!1),B=U(!1);function O(){h.value=!0,setTimeout(()=>{h.value=!1,B.value=!0,setTimeout(()=>{B.value=!1},3e3)},1200)}return(ps,s)=>(u(),f("div",Se,[r(J,{title:"Platform Settings",subtitle:"Environment info, feature toggles, API configuration, and display preferences",breadcrumbs:[{label:"Administration"},{label:"Settings"}]},{actions:S(()=>[r(d(k),{label:"Reset to Defaults",icon:"pi pi-refresh",size:"small",outlined:""}),r(d(k),{label:"Save Settings",icon:"pi pi-save",size:"small",loading:h.value,onClick:O},null,8,["loading"])]),_:1}),n("div",Pe,[r(E,{name:"slide-fade"},{default:S(()=>[B.value?(u(),V(d(D),{key:0,severity:"success",closable:!1},{default:S(()=>[...s[16]||(s[16]=[Q(" Settings saved successfully. ",-1)])]),_:1})):P("",!0)]),_:1}),n("div",ze,[s[25]||(s[25]=n("div",{class:"section-label"},"Environment Information",-1)),n("div",Te,[n("div",Be,[s[17]||(s[17]=n("span",{class:"env-key"},"Platform",-1)),n("span",Ie,p(t.name),1)]),n("div",Ae,[s[18]||(s[18]=n("span",{class:"env-key"},"Version",-1)),n("span",Oe,p(t.version),1)]),n("div",Ue,[s[19]||(s[19]=n("span",{class:"env-key"},"Build",-1)),n("span",xe,p(t.buildId),1)]),n("div",Ce,[s[20]||(s[20]=n("span",{class:"env-key"},"Build Date",-1)),n("span",$e,p(t.buildDate),1)]),n("div",Le,[s[21]||(s[21]=n("span",{class:"env-key"},"Environment",-1)),n("span",je,p(t.environment),1)]),n("div",Ee,[s[22]||(s[22]=n("span",{class:"env-key"},"Region",-1)),n("span",De,p(t.region),1)]),n("div",Re,[s[23]||(s[23]=n("span",{class:"env-key"},"Node.js",-1)),n("span",Ne,p(t.nodeVersion),1)]),n("div",Me,[s[24]||(s[24]=n("span",{class:"env-key"},"Vue.js",-1)),n("span",Fe,p(t.vueVersion),1)])])]),n("div",Ke,[s[32]||(s[32]=n("div",{class:"section-label"},"Feature Toggles",-1)),s[33]||(s[33]=n("p",{class:"section-sub"},"Enable or disable platform features. Changes take effect immediately.",-1)),n("div",We,[n("div",qe,[s[26]||(s[26]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"AI Analytics"),n("span",{class:"toggle-desc"},"Enable LLM-powered anomaly detection and recommendations")],-1)),r(d(b),{modelValue:o.aiAnalytics,"onUpdate:modelValue":s[0]||(s[0]=i=>o.aiAnalytics=i)},null,8,["modelValue"])]),n("div",Ge,[s[27]||(s[27]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"Real-time Alerts"),n("span",{class:"toggle-desc"},"Push notifications for threshold breaches and device faults")],-1)),r(d(b),{modelValue:o.realtimeAlerts,"onUpdate:modelValue":s[1]||(s[1]=i=>o.realtimeAlerts=i)},null,8,["modelValue"])]),n("div",Ye,[s[28]||(s[28]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"Export API"),n("span",{class:"toggle-desc"},"Allow external consumers to access data products via REST API")],-1)),r(d(b),{modelValue:o.exportApi,"onUpdate:modelValue":s[2]||(s[2]=i=>o.exportApi=i)},null,8,["modelValue"])]),n("div",He,[s[29]||(s[29]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"Demo Mode"),n("span",{class:"toggle-desc"},"Show demo data when backend is unavailable (no real ingestion)")],-1)),r(d(b),{modelValue:o.demoMode,"onUpdate:modelValue":s[3]||(s[3]=i=>o.demoMode=i)},null,8,["modelValue"])]),n("div",Qe,[s[30]||(s[30]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"Beta Features"),n("span",{class:"toggle-desc"},"Enable experimental features — may be unstable")],-1)),r(d(b),{modelValue:o.betaFeatures,"onUpdate:modelValue":s[4]||(s[4]=i=>o.betaFeatures=i)},null,8,["modelValue"])]),n("div",Ze,[s[31]||(s[31]=n("div",{class:"toggle-info"},[n("span",{class:"toggle-name"},"Debug Logging"),n("span",{class:"toggle-desc"},"Verbose console and server-side debug output")],-1)),r(d(b),{modelValue:o.debugLogging,"onUpdate:modelValue":s[5]||(s[5]=i=>o.debugLogging=i)},null,8,["modelValue"])])])]),n("div",Je,[s[43]||(s[43]=n("div",{class:"section-label"},"API & Integration Configuration",-1)),n("div",Xe,[n("div",_e,[s[34]||(s[34]=n("label",{class:"sf-label"},"API Base URL",-1)),r(d(m),{modelValue:a.baseUrl,"onUpdate:modelValue":s[6]||(s[6]=i=>a.baseUrl=i),class:"sf-input"},null,8,["modelValue"])]),n("div",es,[s[35]||(s[35]=n("label",{class:"sf-label"},"Request Timeout (s)",-1)),r(d(m),{modelValue:a.timeout,"onUpdate:modelValue":s[7]||(s[7]=i=>a.timeout=i),modelModifiers:{number:!0},type:"number",class:"sf-input sf-input--sm"},null,8,["modelValue"])]),n("div",ss,[s[36]||(s[36]=n("label",{class:"sf-label"},"Max Retries",-1)),r(d(m),{modelValue:a.retries,"onUpdate:modelValue":s[8]||(s[8]=i=>a.retries=i),modelModifiers:{number:!0},type:"number",class:"sf-input sf-input--sm"},null,8,["modelValue"])]),s[41]||(s[41]=n("div",{class:"sf-divider"},null,-1)),n("div",ns,[s[37]||(s[37]=n("label",{class:"sf-label"},"Keycloak URL",-1)),r(d(m),{modelValue:a.keycloakUrl,"onUpdate:modelValue":s[9]||(s[9]=i=>a.keycloakUrl=i),class:"sf-input"},null,8,["modelValue"])]),n("div",ts,[s[38]||(s[38]=n("label",{class:"sf-label"},"Keycloak Realm",-1)),r(d(m),{modelValue:a.keycloakRealm,"onUpdate:modelValue":s[10]||(s[10]=i=>a.keycloakRealm=i),class:"sf-input sf-input--sm"},null,8,["modelValue"])]),s[42]||(s[42]=n("div",{class:"sf-divider"},null,-1)),n("div",os,[s[39]||(s[39]=n("label",{class:"sf-label"},"MQTT Broker",-1)),r(d(m),{modelValue:a.mqttBroker,"onUpdate:modelValue":s[11]||(s[11]=i=>a.mqttBroker=i),class:"sf-input"},null,8,["modelValue"])]),n("div",as,[s[40]||(s[40]=n("label",{class:"sf-label"},"Kafka Brokers",-1)),r(d(m),{modelValue:a.kafkaBrokers,"onUpdate:modelValue":s[12]||(s[12]=i=>a.kafkaBrokers=i),class:"sf-input"},null,8,["modelValue"])])])]),n("div",ls,[s[47]||(s[47]=n("div",{class:"section-label"},"Display & Localisation Settings",-1)),n("div",is,[n("div",rs,[s[44]||(s[44]=n("label",{class:"sf-label"},"Timezone",-1)),r(d(A),{modelValue:g.timezone,"onUpdate:modelValue":s[13]||(s[13]=i=>g.timezone=i),options:l,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])]),n("div",ds,[s[45]||(s[45]=n("label",{class:"sf-label"},"Unit System",-1)),r(d(A),{modelValue:g.unitSystem,"onUpdate:modelValue":s[14]||(s[14]=i=>g.unitSystem=i),options:z,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])]),n("div",cs,[s[46]||(s[46]=n("label",{class:"sf-label"},"Default Date Range",-1)),r(d(A),{modelValue:g.dateRange,"onUpdate:modelValue":s[15]||(s[15]=i=>g.dateRange=i),options:T,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])])])]),n("div",gs,[r(d(k),{label:"Save All Settings",icon:"pi pi-save",loading:h.value,onClick:O},null,8,["loading"]),r(d(k),{label:"Reset to Defaults",icon:"pi pi-refresh",outlined:""})])])]))}}),hs=Z(us,[["__scopeId","data-v-caba0965"]]);export{hs as default};
