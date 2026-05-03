import{W as Y,bv as ee,ao as G,b as m,c as f,g as s,a3 as u,a4 as I,am as se,X as ne,Y as te,D as oe,Q as ae,k as x,w as $,n as le,a5 as ie,h as V,O as re,aa as Q,a as de,o as ce,bw as ge,x as F,y as ue,z as me,e as r,f as d,s as T,i as W,t as c,m as R,af as y,r as b,q as pe,v as be,bx as ve,bu as D,_ as fe}from"./index-BuosndfI.js";import{s as M}from"./index-CH5hmYI-.js";import{P as he}from"./PageHeader-C6DQ1rwQ.js";var we=`
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
`,ye={root:{position:"relative"}},ke={root:function(t){var o=t.instance,i=t.props;return["p-toggleswitch p-component",{"p-toggleswitch-checked":o.checked,"p-disabled":i.disabled,"p-invalid":o.$invalid}]},input:"p-toggleswitch-input",slider:"p-toggleswitch-slider",handle:"p-toggleswitch-handle"},Se=Y.extend({name:"toggleswitch",style:we,classes:ke,inlineStyles:ye}),Ve={name:"BaseToggleSwitch",extends:ee,props:{trueValue:{type:null,default:!0},falseValue:{type:null,default:!1},readonly:{type:Boolean,default:!1},tabindex:{type:Number,default:null},inputId:{type:String,default:null},inputClass:{type:[String,Object],default:null},inputStyle:{type:Object,default:null},ariaLabelledby:{type:String,default:null},ariaLabel:{type:String,default:null}},style:Se,provide:function(){return{$pcToggleSwitch:this,$parentInstance:this}}},k={name:"ToggleSwitch",extends:Ve,inheritAttrs:!1,emits:["change","focus","blur"],methods:{getPTOptions:function(t){var o=t==="root"?this.ptmi:this.ptm;return o(t,{context:{checked:this.checked,disabled:this.disabled}})},onChange:function(t){if(!this.disabled&&!this.readonly){var o=this.checked?this.falseValue:this.trueValue;this.writeValue(o,t),this.$emit("change",t)}},onFocus:function(t){this.$emit("focus",t)},onBlur:function(t){var o,i;this.$emit("blur",t),(o=(i=this.formField).onBlur)===null||o===void 0||o.call(i,t)}},computed:{checked:function(){return this.d_value===this.trueValue},dataP:function(){return G({checked:this.checked,disabled:this.disabled,invalid:this.$invalid})}}},Pe=["data-p-checked","data-p-disabled","data-p"],ze=["id","checked","tabindex","disabled","readonly","aria-checked","aria-labelledby","aria-label","aria-invalid"],Ae=["data-p"],Te=["data-p"];function Ie(n,t,o,i,w,l){return m(),f("div",u({class:n.cx("root"),style:n.sx("root")},l.getPTOptions("root"),{"data-p-checked":l.checked,"data-p-disabled":n.disabled,"data-p":l.dataP}),[s("input",u({id:n.inputId,type:"checkbox",role:"switch",class:[n.cx("input"),n.inputClass],style:n.inputStyle,checked:l.checked,tabindex:n.tabindex,disabled:n.disabled,readonly:n.readonly,"aria-checked":l.checked,"aria-labelledby":n.ariaLabelledby,"aria-label":n.ariaLabel,"aria-invalid":n.invalid||void 0,onFocus:t[0]||(t[0]=function(){return l.onFocus&&l.onFocus.apply(l,arguments)}),onBlur:t[1]||(t[1]=function(){return l.onBlur&&l.onBlur.apply(l,arguments)}),onChange:t[2]||(t[2]=function(){return l.onChange&&l.onChange.apply(l,arguments)})},l.getPTOptions("input")),null,16,ze),s("div",u({class:n.cx("slider")},l.getPTOptions("slider"),{"data-p":l.dataP}),[s("div",u({class:n.cx("handle")},l.getPTOptions("handle"),{"data-p":l.dataP}),[I(n.$slots,"handle",{checked:l.checked})],16,Te)],16,Ae)],16,Pe)}k.render=Ie;var Be=`
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
`,Oe={root:function(t){var o=t.props;return["p-message p-component p-message-"+o.severity,{"p-message-outlined":o.variant==="outlined","p-message-simple":o.variant==="simple","p-message-sm":o.size==="small","p-message-lg":o.size==="large"}]},contentWrapper:"p-message-content-wrapper",content:"p-message-content",icon:"p-message-icon",text:"p-message-text",closeButton:"p-message-close-button",closeIcon:"p-message-close-icon"},Ce=Y.extend({name:"message",style:Be,classes:Oe}),Ue={name:"BaseMessage",extends:te,props:{severity:{type:String,default:"info"},closable:{type:Boolean,default:!1},life:{type:Number,default:null},icon:{type:String,default:void 0},closeIcon:{type:String,default:void 0},closeButtonProps:{type:null,default:null},size:{type:String,default:null},variant:{type:String,default:null}},style:Ce,provide:function(){return{$pcMessage:this,$parentInstance:this}}};function B(n){"@babel/helpers - typeof";return B=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},B(n)}function q(n,t,o){return(t=xe(t))in n?Object.defineProperty(n,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):n[t]=o,n}function xe(n){var t=$e(n,"string");return B(t)=="symbol"?t:t+""}function $e(n,t){if(B(n)!="object"||!n)return n;var o=n[Symbol.toPrimitive];if(o!==void 0){var i=o.call(n,t);if(B(i)!="object")return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(n)}var X={name:"Message",extends:Ue,inheritAttrs:!1,emits:["close","life-end"],timeout:null,data:function(){return{visible:!0}},mounted:function(){var t=this;this.life&&setTimeout(function(){t.visible=!1,t.$emit("life-end")},this.life)},methods:{close:function(t){this.visible=!1,this.$emit("close",t)}},computed:{closeAriaLabel:function(){return this.$primevue.config.locale.aria?this.$primevue.config.locale.aria.close:void 0},dataP:function(){return G(q(q({outlined:this.variant==="outlined",simple:this.variant==="simple"},this.severity,this.severity),this.size,this.size))}},directives:{ripple:ne},components:{TimesIcon:se}};function O(n){"@babel/helpers - typeof";return O=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},O(n)}function K(n,t){var o=Object.keys(n);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(n);t&&(i=i.filter(function(w){return Object.getOwnPropertyDescriptor(n,w).enumerable})),o.push.apply(o,i)}return o}function H(n){for(var t=1;t<arguments.length;t++){var o=arguments[t]!=null?arguments[t]:{};t%2?K(Object(o),!0).forEach(function(i){Le(n,i,o[i])}):Object.getOwnPropertyDescriptors?Object.defineProperties(n,Object.getOwnPropertyDescriptors(o)):K(Object(o)).forEach(function(i){Object.defineProperty(n,i,Object.getOwnPropertyDescriptor(o,i))})}return n}function Le(n,t,o){return(t=je(t))in n?Object.defineProperty(n,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):n[t]=o,n}function je(n){var t=Ee(n,"string");return O(t)=="symbol"?t:t+""}function Ee(n,t){if(O(n)!="object"||!n)return n;var o=n[Symbol.toPrimitive];if(o!==void 0){var i=o.call(n,t);if(O(i)!="object")return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(n)}var Re=["data-p"],De=["data-p"],Me=["data-p"],Ne=["aria-label","data-p"],Fe=["data-p"];function We(n,t,o,i,w,l){var C=oe("TimesIcon"),P=ae("ripple");return m(),x(Q,u({name:"p-message",appear:""},n.ptmi("transition")),{default:$(function(){return[w.visible?(m(),f("div",u({key:0,class:n.cx("root"),role:"alert","aria-live":"assertive","aria-atomic":"true","data-p":l.dataP},n.ptm("root")),[s("div",u({class:n.cx("contentWrapper")},n.ptm("contentWrapper")),[n.$slots.container?I(n.$slots,"container",{key:0,closeCallback:l.close}):(m(),f("div",u({key:1,class:n.cx("content"),"data-p":l.dataP},n.ptm("content")),[I(n.$slots,"icon",{class:le(n.cx("icon"))},function(){return[(m(),x(ie(n.icon?"span":null),u({class:[n.cx("icon"),n.icon],"data-p":l.dataP},n.ptm("icon")),null,16,["class","data-p"]))]}),n.$slots.default?(m(),f("div",u({key:0,class:n.cx("text"),"data-p":l.dataP},n.ptm("text")),[I(n.$slots,"default")],16,Me)):V("",!0),n.closable?re((m(),f("button",u({key:1,class:n.cx("closeButton"),"aria-label":l.closeAriaLabel,type:"button",onClick:t[0]||(t[0]=function(z){return l.close(z)}),"data-p":l.dataP},H(H({},n.closeButtonProps),n.ptm("closeButton"))),[I(n.$slots,"closeicon",{},function(){return[n.closeIcon?(m(),f("i",u({key:0,class:[n.cx("closeIcon"),n.closeIcon],"data-p":l.dataP},n.ptm("closeIcon")),null,16,Fe)):(m(),x(C,u({key:1,class:[n.cx("closeIcon"),n.closeIcon],"data-p":l.dataP},n.ptm("closeIcon")),null,16,["class","data-p"]))]})],16,Ne)),[[P]]):V("",!0)],16,De))],16)],16,Re)):V("",!0)]}),_:3},16)}X.render=We;const qe={class:"view-page"},Ke={key:0,class:"live-banner"},He={style:{"margin-left":"0.25rem"}},Ye={class:"view-body"},Ge={key:0,class:"card card-body"},Qe={class:"sim-grid"},Xe={class:"sim-row"},Ze={class:"sim-row"},_e={class:"env-badge env-badge--blue"},Je={class:"sim-row"},es={class:"sim-row"},ss={class:"sim-row"},ns={class:"sim-row"},ts={class:"sim-actions"},os={class:"card card-body"},as={class:"env-grid"},ls={class:"env-row"},is={class:"env-val"},rs={class:"env-row"},ds={class:"env-val env-badge env-badge--blue"},cs={class:"env-row"},gs={class:"env-val env-mono"},us={class:"env-row"},ms={class:"env-val"},ps={class:"env-row"},bs={class:"env-val env-badge env-badge--green"},vs={class:"env-row"},fs={class:"env-val"},hs={class:"env-row"},ws={class:"env-val env-mono"},ys={class:"env-row"},ks={class:"env-val env-mono"},Ss={class:"card card-body"},Vs={class:"toggles-grid"},Ps={class:"toggle-row"},zs={class:"toggle-row"},As={class:"toggle-row"},Ts={class:"toggle-row"},Is={class:"toggle-row"},Bs={class:"toggle-row"},Os={class:"card card-body"},Cs={class:"settings-form"},Us={class:"sf-row"},xs={class:"sf-row"},$s={class:"sf-row"},Ls={class:"sf-row"},js={class:"sf-row"},Es={class:"sf-row"},Rs={class:"sf-row"},Ds={class:"card card-body"},Ms={class:"settings-form"},Ns={class:"sf-row"},Fs={class:"sf-row"},Ws={class:"sf-row"},qs={class:"settings-actions"},Ks=de({__name:"AdminSettingsView",setup(n){const t=b(!1),o=b("unknown"),i=b(1),w=b(0),l=b(""),C=b(0),P=b("unknown"),z=b("unknown"),A=b(!1);ce(async()=>{try{const[v,e,a,E]=await Promise.all([ge(),F(),ue(),me()]);v&&(w.value=v.seed,i.value=v.time_acceleration,l.value=v.start_time,o.value=v.simulation_state,C.value=v.registered_meters),e&&(o.value=e.state),P.value=(a==null?void 0:a.status)??"unknown",z.value=(E==null?void 0:E.status)??"unknown",t.value=!0}catch{}});async function L(v){A.value=!0;try{v==="start"?await pe():v==="pause"?await be():await ve();const e=await F();e&&(o.value=e.state)}catch{}finally{A.value=!1}}const h={name:"FACIS IoT & AI Platform",version:"1.4.0",buildDate:"2026-04-05",buildId:"2026.04.05.1",environment:"Production",region:"EU-West (Lisbon)",nodeVersion:"v20.12.0",vueVersion:"3.4.x"},p=D({aiAnalytics:!0,realtimeAlerts:!0,exportApi:!0,demoMode:!1,betaFeatures:!1,debugLogging:!1}),g=D({baseUrl:"/api",timeout:30,retries:3,keycloakUrl:"https://identity.facis.cloud",keycloakRealm:"facis",mqttBroker:"mqtt://broker.facis.local:1883",kafkaBrokers:"kafka-1.facis.local:9092,kafka-2.facis.local:9092"}),S=D({timezone:"Europe/Lisbon",unitSystem:"metric",dateRange:"24h",numberLocale:"en-GB",language:"en"}),Z=[{label:"Europe/Lisbon (UTC+1)",value:"Europe/Lisbon"},{label:"Europe/Berlin (UTC+2)",value:"Europe/Berlin"},{label:"UTC",value:"UTC"},{label:"America/New_York (UTC-4)",value:"America/New_York"}],_=[{label:"Metric (kWh, °C, m/s)",value:"metric"},{label:"Imperial (kWh, °F, mph)",value:"imperial"}],J=[{label:"Last 24 hours",value:"24h"},{label:"Last 7 days",value:"7d"},{label:"Last 30 days",value:"30d"}],U=b(!1),j=b(!1);function N(){U.value=!0,setTimeout(()=>{U.value=!1,j.value=!0,setTimeout(()=>{j.value=!1},3e3)},1200)}return(v,e)=>(m(),f("div",qe,[r(he,{title:"Platform Settings",subtitle:"Environment info, feature toggles, API configuration, and display preferences",breadcrumbs:[{label:"Administration"},{label:"Settings"}]},{actions:$(()=>[r(d(T),{label:"Save Settings",icon:"pi pi-save",size:"small",loading:U.value,onClick:N},null,8,["loading"])]),_:1}),t.value?(m(),f("div",Ke,[e[19]||(e[19]=s("span",{class:"live-dot"},null,-1)),e[20]||(e[20]=W(" Live simulation config loaded — state: ",-1)),s("strong",He,c(o.value),1)])):V("",!0),s("div",Ye,[r(Q,{name:"slide-fade"},{default:$(()=>[j.value?(m(),x(d(X),{key:0,severity:"success",closable:!1},{default:$(()=>[...e[21]||(e[21]=[W(" Settings saved successfully. ",-1)])]),_:1})):V("",!0)]),_:1}),t.value?(m(),f("div",Ge,[e[28]||(e[28]=s("div",{class:"section-label"},"Simulation Control — Live",-1)),s("div",Qe,[s("div",Xe,[e[22]||(e[22]=s("span",{class:"sim-key"},"State",-1)),s("span",{class:"env-badge",style:R({background:o.value==="running"?"#dcfce7":"#fee2e2",color:o.value==="running"?"#15803d":"#991b1b"})},c(o.value),5)]),s("div",Ze,[e[23]||(e[23]=s("span",{class:"sim-key"},"Seed",-1)),s("code",_e,c(w.value),1)]),s("div",Je,[e[24]||(e[24]=s("span",{class:"sim-key"},"Acceleration",-1)),s("span",null,c(i.value)+"×",1)]),s("div",es,[e[25]||(e[25]=s("span",{class:"sim-key"},"Registered Meters",-1)),s("span",null,c(C.value),1)]),s("div",ss,[e[26]||(e[26]=s("span",{class:"sim-key"},"Sim Health",-1)),s("span",{style:R({color:P.value==="ok"?"var(--facis-success)":"var(--facis-error)"})},c(P.value),5)]),s("div",ns,[e[27]||(e[27]=s("span",{class:"sim-key"},"AI Health",-1)),s("span",{style:R({color:z.value==="ok"?"var(--facis-success)":"var(--facis-error)"})},c(z.value),5)])]),s("div",ts,[r(d(T),{label:"Start",icon:"pi pi-play",size:"small",severity:"success",loading:A.value,onClick:e[0]||(e[0]=a=>L("start"))},null,8,["loading"]),r(d(T),{label:"Pause",icon:"pi pi-pause",size:"small",severity:"warning",loading:A.value,onClick:e[1]||(e[1]=a=>L("pause"))},null,8,["loading"]),r(d(T),{label:"Reset",icon:"pi pi-replay",size:"small",severity:"danger",loading:A.value,onClick:e[2]||(e[2]=a=>L("reset"))},null,8,["loading"])])])):V("",!0),s("div",os,[e[37]||(e[37]=s("div",{class:"section-label"},"Environment Information",-1)),s("div",as,[s("div",ls,[e[29]||(e[29]=s("span",{class:"env-key"},"Platform",-1)),s("span",is,c(h.name),1)]),s("div",rs,[e[30]||(e[30]=s("span",{class:"env-key"},"Version",-1)),s("span",ds,c(h.version),1)]),s("div",cs,[e[31]||(e[31]=s("span",{class:"env-key"},"Build",-1)),s("span",gs,c(h.buildId),1)]),s("div",us,[e[32]||(e[32]=s("span",{class:"env-key"},"Build Date",-1)),s("span",ms,c(h.buildDate),1)]),s("div",ps,[e[33]||(e[33]=s("span",{class:"env-key"},"Environment",-1)),s("span",bs,c(h.environment),1)]),s("div",vs,[e[34]||(e[34]=s("span",{class:"env-key"},"Region",-1)),s("span",fs,c(h.region),1)]),s("div",hs,[e[35]||(e[35]=s("span",{class:"env-key"},"Node.js",-1)),s("span",ws,c(h.nodeVersion),1)]),s("div",ys,[e[36]||(e[36]=s("span",{class:"env-key"},"Vue.js",-1)),s("span",ks,c(h.vueVersion),1)])])]),s("div",Ss,[e[44]||(e[44]=s("div",{class:"section-label"},"Feature Toggles",-1)),e[45]||(e[45]=s("p",{class:"section-sub"},"Enable or disable platform features. Changes take effect immediately.",-1)),s("div",Vs,[s("div",Ps,[e[38]||(e[38]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"AI Analytics"),s("span",{class:"toggle-desc"},"Enable LLM-powered anomaly detection and recommendations")],-1)),r(d(k),{modelValue:p.aiAnalytics,"onUpdate:modelValue":e[3]||(e[3]=a=>p.aiAnalytics=a)},null,8,["modelValue"])]),s("div",zs,[e[39]||(e[39]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"Real-time Alerts"),s("span",{class:"toggle-desc"},"Push notifications for threshold breaches and device faults")],-1)),r(d(k),{modelValue:p.realtimeAlerts,"onUpdate:modelValue":e[4]||(e[4]=a=>p.realtimeAlerts=a)},null,8,["modelValue"])]),s("div",As,[e[40]||(e[40]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"Export API"),s("span",{class:"toggle-desc"},"Allow external consumers to access data products via REST API")],-1)),r(d(k),{modelValue:p.exportApi,"onUpdate:modelValue":e[5]||(e[5]=a=>p.exportApi=a)},null,8,["modelValue"])]),s("div",Ts,[e[41]||(e[41]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"Demo Mode"),s("span",{class:"toggle-desc"},"Show demo data when backend is unavailable (no real ingestion)")],-1)),r(d(k),{modelValue:p.demoMode,"onUpdate:modelValue":e[6]||(e[6]=a=>p.demoMode=a)},null,8,["modelValue"])]),s("div",Is,[e[42]||(e[42]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"Beta Features"),s("span",{class:"toggle-desc"},"Enable experimental features — may be unstable")],-1)),r(d(k),{modelValue:p.betaFeatures,"onUpdate:modelValue":e[7]||(e[7]=a=>p.betaFeatures=a)},null,8,["modelValue"])]),s("div",Bs,[e[43]||(e[43]=s("div",{class:"toggle-info"},[s("span",{class:"toggle-name"},"Debug Logging"),s("span",{class:"toggle-desc"},"Verbose console and server-side debug output")],-1)),r(d(k),{modelValue:p.debugLogging,"onUpdate:modelValue":e[8]||(e[8]=a=>p.debugLogging=a)},null,8,["modelValue"])])])]),s("div",Os,[e[55]||(e[55]=s("div",{class:"section-label"},"API & Integration Configuration",-1)),s("div",Cs,[s("div",Us,[e[46]||(e[46]=s("label",{class:"sf-label"},"API Base URL",-1)),r(d(y),{modelValue:g.baseUrl,"onUpdate:modelValue":e[9]||(e[9]=a=>g.baseUrl=a),class:"sf-input"},null,8,["modelValue"])]),s("div",xs,[e[47]||(e[47]=s("label",{class:"sf-label"},"Request Timeout (s)",-1)),r(d(y),{modelValue:g.timeout,"onUpdate:modelValue":e[10]||(e[10]=a=>g.timeout=a),modelModifiers:{number:!0},type:"number",class:"sf-input sf-input--sm"},null,8,["modelValue"])]),s("div",$s,[e[48]||(e[48]=s("label",{class:"sf-label"},"Max Retries",-1)),r(d(y),{modelValue:g.retries,"onUpdate:modelValue":e[11]||(e[11]=a=>g.retries=a),modelModifiers:{number:!0},type:"number",class:"sf-input sf-input--sm"},null,8,["modelValue"])]),e[53]||(e[53]=s("div",{class:"sf-divider"},null,-1)),s("div",Ls,[e[49]||(e[49]=s("label",{class:"sf-label"},"Keycloak URL",-1)),r(d(y),{modelValue:g.keycloakUrl,"onUpdate:modelValue":e[12]||(e[12]=a=>g.keycloakUrl=a),class:"sf-input"},null,8,["modelValue"])]),s("div",js,[e[50]||(e[50]=s("label",{class:"sf-label"},"Keycloak Realm",-1)),r(d(y),{modelValue:g.keycloakRealm,"onUpdate:modelValue":e[13]||(e[13]=a=>g.keycloakRealm=a),class:"sf-input sf-input--sm"},null,8,["modelValue"])]),e[54]||(e[54]=s("div",{class:"sf-divider"},null,-1)),s("div",Es,[e[51]||(e[51]=s("label",{class:"sf-label"},"MQTT Broker",-1)),r(d(y),{modelValue:g.mqttBroker,"onUpdate:modelValue":e[14]||(e[14]=a=>g.mqttBroker=a),class:"sf-input"},null,8,["modelValue"])]),s("div",Rs,[e[52]||(e[52]=s("label",{class:"sf-label"},"Kafka Brokers",-1)),r(d(y),{modelValue:g.kafkaBrokers,"onUpdate:modelValue":e[15]||(e[15]=a=>g.kafkaBrokers=a),class:"sf-input"},null,8,["modelValue"])])])]),s("div",Ds,[e[59]||(e[59]=s("div",{class:"section-label"},"Display & Localisation Settings",-1)),s("div",Ms,[s("div",Ns,[e[56]||(e[56]=s("label",{class:"sf-label"},"Timezone",-1)),r(d(M),{modelValue:S.timezone,"onUpdate:modelValue":e[16]||(e[16]=a=>S.timezone=a),options:Z,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])]),s("div",Fs,[e[57]||(e[57]=s("label",{class:"sf-label"},"Unit System",-1)),r(d(M),{modelValue:S.unitSystem,"onUpdate:modelValue":e[17]||(e[17]=a=>S.unitSystem=a),options:_,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])]),s("div",Ws,[e[58]||(e[58]=s("label",{class:"sf-label"},"Default Date Range",-1)),r(d(M),{modelValue:S.dateRange,"onUpdate:modelValue":e[18]||(e[18]=a=>S.dateRange=a),options:J,"option-label":"label","option-value":"value",class:"sf-select"},null,8,["modelValue"])])])]),s("div",qs,[r(d(T),{label:"Save All Settings",icon:"pi pi-save",loading:U.value,onClick:N},null,8,["loading"])])])]))}}),Qs=fe(Ks,[["__scopeId","data-v-fe8dafcb"]]);export{Qs as default};
