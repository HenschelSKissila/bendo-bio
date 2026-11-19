import{c as d}from"./index-CXoURxY7.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=d("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);function u(a,o){if(!o.length){alert("Aucune donnée à exporter.");return}const c=Object.keys(o[0]),s=e=>{const t=e==null?"":typeof e=="object"?JSON.stringify(e):String(e);return/[";\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t},r=[c.join(";"),...o.map(e=>c.map(t=>s(e[t])).join(";"))].join(`
`),l=new Blob(["\uFEFF"+r],{type:"text/csv;charset=utf-8"}),n=document.createElement("a"),i=new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");n.href=URL.createObjectURL(l),n.download=`bendo-${a}-${i}.csv`,n.click(),URL.revokeObjectURL(n.href)}export{y as D,u as d};
