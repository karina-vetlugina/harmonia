(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))e(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&e(s)}).observe(document,{childList:!0,subtree:!0});function n(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function e(r){if(r.ep)return;r.ep=!0;const i=n(r);fetch(r.href,i)}})();const h={DOT_R:20,GRID0:10,STEP:50,COLS:29,ROWS:21,MAX_DOTS:42e3,get RIPPLE_SIGMA(){return this.STEP*5.35},get TILE_W(){return this.COLS*this.STEP},get TILE_H(){return this.ROWS*this.STEP}},R=64,z=[{x:.5,y:.4,r:176,g:238,b:208},{x:.9,y:.14,r:232,g:112,b:168},{x:.12,y:.86,r:212,g:132,b:96}];function K(o,t){const n=h.COLS*h.ROWS,e=Math.floor(h.MAX_DOTS/n),r=o/Math.max(t,1),i=10;let s=Math.min(i,Math.max(2,Math.ceil(o/420))),a=Math.min(i,Math.max(2,Math.ceil(t/300)));for(r>1?s=Math.min(i,Math.max(s,Math.round(a*r*.92))):a=Math.min(i,Math.max(a,Math.round(s/Math.max(r,.01)*.92)));s*a>e&&s>2&&a>2;)s>=a?s--:a--;for(;s*a>e&&s>2;)s--;for(;s*a>e&&a>2;)a--;return{tilesX:s,tilesY:a}}function j(o,t){const n=(o-1)*h.TILE_W+h.GRID0+(h.COLS-1)*h.STEP+h.DOT_R+12,e=(t-1)*h.TILE_H+h.GRID0+(h.ROWS-1)*h.STEP+h.DOT_R+12;return{worldW:n,worldH:e}}function k(o,t){const{TILE_W:n,TILE_H:e,GRID0:r,STEP:i,COLS:s,ROWS:a}=h,l=o*t*s*a,c=new Float32Array(l*2);let u=0;for(let f=0;f<t;f++)for(let m=0;m<o;m++)for(let E=0;E<a;E++)for(let w=0;w<s;w++)c[u++]=m*n+r+w*i,c[u++]=f*e+r+E*i;return c}function J(o,t,n,e){const r=Math.max(n/o,e/t),i=(n-o*r)*.5,s=(e-t*r)*.5,a=2*r/n,l=2*i/n-1,c=-(2*r)/e,u=1-2*s/e;return new Float32Array([a,0,0,0,c,0,l,u,1])}function L(o,t,n,e,r,i,s){const a=(o-n.left)*(i/n.width),l=(t-n.top)*(s/n.height),c=Math.max(i/e,s/r),u=(i-e*c)*.5,f=(s-r*c)*.5;return{x:(a-u)/c,y:(l-f)/c}}function F(o,t,n,e,r,i,s,a,l){const c=Math.max(i/e,s/r),u=(i-e*c)*.5,f=(s-r*c)*.5,m=o*c+u,E=t*c+f,w=n.left+m*n.width/i,v=n.top+E*n.height/s;return{nx:w/a,ny:v/l}}function G(o,t){let e=0,r=0,i=0,s=0;for(const a of z){const l=o-a.x,c=t-a.y,u=1/(.06+l*l+c*c);s+=u,e+=u*a.r,r+=u*a.g,i+=u*a.b}return{r:e/s,g:r/s,b:i/s}}class Q{constructor(){this.items=[],this._listeners=new Set}subscribe(t){return this._listeners.add(t),()=>this._listeners.delete(t)}_emit(){for(const t of this._listeners)t(this.items)}add(t){var e;this.items.length>=R&&this.items.shift();const n={id:t.id??((e=crypto.randomUUID)==null?void 0:e.call(crypto))??String(Date.now()),nx:t.nx,ny:t.ny,x:t.x,y:t.y,r:t.r,g:t.g,b:t.b,createdAt:t.createdAt??Date.now()};return this.items.push(n),this._emit(),n}addMany(t){if(t.length===0)return;const n=Date.now();for(let e=0;e<t.length;e++){const r=t[e];this.items.length>=R&&this.items.shift();const i=r.id??(crypto.randomUUID?crypto.randomUUID():`r-${n}-${e}-${Math.random()}`);this.items.push({id:i,nx:r.nx,ny:r.ny,x:r.x,y:r.y,r:r.r,g:r.g,b:r.b,createdAt:r.createdAt??n})}this._emit()}clear(){this.items.length=0,this._emit()}replaceAll(t){this.items.length=0;for(const n of t.slice(0,R))this.items.push(n);this._emit()}remapToWorld(t,n,e,r,i,s,a){for(const l of this.items){const c=L(l.nx*s,l.ny*a,t,n,e,r,i);l.x=c.x,l.y=c.y}}}const Z=`#version 300 es
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec2 a_world;

uniform mat3 u_worldToClip;
uniform float u_dotR;

out vec2 v_world;
out vec2 v_cellCenter;

void main() {
  v_cellCenter = a_world;
  vec2 offset = a_quad * u_dotR;
  v_world = a_world + offset;
  vec3 clip = u_worldToClip * vec3(v_world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
`,tt=`#version 300 es
precision highp float;

uniform highp sampler2D u_rippleTex;
uniform int u_rippleCount;
uniform float u_sigma;
uniform float u_dotR;
const int MAX_R = 64;

in vec2 v_world;
in vec2 v_cellCenter;
out vec4 outColor;

void main() {
  float bestH = 0.0;
  float bestHCenter = 0.0;
  vec3 bestRgb = vec3(0.88);

  for (int i = 0; i < MAX_R; i++) {
    float use = step(float(i) + 0.5, float(u_rippleCount));
    vec4 row0 = texelFetch(u_rippleTex, ivec2(i, 0), 0);
    vec4 row1 = texelFetch(u_rippleTex, ivec2(i, 1), 0);
    vec2 c = row0.xy;
    vec3 rgb = vec3(row0.z, row0.w, row1.x);
    vec2 dF = v_world - c;
    float dF2 = dot(dF, dF);
    float h = 0.92 * exp(-dF2 / (2.0 * u_sigma * u_sigma)) * use;
    if (h > bestH) {
      bestH = h;
      bestRgb = rgb;
    }
    vec2 dC = v_cellCenter - c;
    float dC2 = dot(dC, dC);
    float hC = 0.92 * exp(-dC2 / (2.0 * u_sigma * u_sigma)) * use;
    if (hC > bestHCenter) bestHCenter = hC;
  }

  float v_scale = bestHCenter > 0.02 ? clamp((bestHCenter - 0.02) / 0.9, 0.0, 1.0) : 0.0;
  if (v_scale < 0.0001) discard;

  vec2 o = v_world - v_cellCenter;
  float r = length(o);
  float limit = u_dotR * v_scale;
  float edge = 1.0 - smoothstep(limit - 1.5, limit + 0.5, r);
  if (edge < 0.001) discard;

  float alpha = 0.95 * edge;
  vec3 base = vec3(0.88);
  vec3 col = mix(base, bestRgb / 255.0, step(0.02, bestH));
  outColor = vec4(col, alpha);
}
`;function O(o,t,n){const e=o.createShader(t);if(o.shaderSource(e,n),o.compileShader(e),!o.getShaderParameter(e,o.COMPILE_STATUS)){const r=o.getShaderInfoLog(e);throw o.deleteShader(e),new Error(r||"shader compile failed")}return e}function et(o,t,n){const e=o.createProgram();if(o.attachShader(e,t),o.attachShader(e,n),o.linkProgram(e),!o.getProgramParameter(e,o.LINK_STATUS)){const r=o.getProgramInfoLog(e);throw o.deleteProgram(e),new Error(r||"program link failed")}return e}class nt{constructor(t){this.gl=t;const n=O(t,t.VERTEX_SHADER,Z),e=O(t,t.FRAGMENT_SHADER,tt);this.program=et(t,n,e),t.deleteShader(n),t.deleteShader(e),this.uWorldToClip=t.getUniformLocation(this.program,"u_worldToClip"),this.uDotR=t.getUniformLocation(this.program,"u_dotR"),this.uRippleTex=t.getUniformLocation(this.program,"u_rippleTex"),this.uRippleCount=t.getUniformLocation(this.program,"u_rippleCount"),this.uSigma=t.getUniformLocation(this.program,"u_sigma"),this.quadVbo=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,this.quadVbo);const r=new Float32Array([-1,-1,1,-1,-1,1,1,1]);t.bufferData(t.ARRAY_BUFFER,r,t.STATIC_DRAW),this.instanceVbo=t.createBuffer(),this.vao=t.createVertexArray(),t.bindVertexArray(this.vao),t.bindBuffer(t.ARRAY_BUFFER,this.quadVbo),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,this.instanceVbo),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,2,t.FLOAT,!1,0,0),t.vertexAttribDivisor(1,1),t.bindVertexArray(null),this.rippleTex=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this.rippleTex),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const i=new Float32Array(R*4*2);t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,R,2,0,t.RGBA,t.FLOAT,i),this.instanceCount=0,this.rippleData=new Float32Array(R*4*2)}setDotPositions(t){const n=this.gl;this.instanceCount=t.length/2,n.bindBuffer(n.ARRAY_BUFFER,this.instanceVbo),n.bufferData(n.ARRAY_BUFFER,t,n.DYNAMIC_DRAW)}uploadRipples(t){const n=this.gl,e=this.rippleData;e.fill(0);const r=Math.min(t.length,R),i=R*4;for(let s=0;s<r;s++){const a=t[s],l=s*4;e[l+0]=a.x,e[l+1]=a.y,e[l+2]=a.r,e[l+3]=a.g;const c=i+s*4;e[c+0]=a.b}return n.bindTexture(n.TEXTURE_2D,this.rippleTex),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.texSubImage2D(n.TEXTURE_2D,0,0,0,R,2,n.RGBA,n.FLOAT,e),r}draw(t,n){const e=this.gl,r=this.uploadRipples(n);e.viewport(0,0,e.drawingBufferWidth,e.drawingBufferHeight),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.useProgram(this.program),e.uniformMatrix3fv(this.uWorldToClip,!1,t),e.uniform1f(this.uDotR,h.DOT_R),e.uniform1f(this.uSigma,h.RIPPLE_SIGMA),e.uniform1i(this.uRippleCount,r),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.rippleTex),e.uniform1i(this.uRippleTex,0),e.bindVertexArray(this.vao),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,this.instanceCount),e.bindVertexArray(null)}}const W=()=>"".replace(/\/$/,"");async function U(o){const t=W();if(!t)return{ok:!1,skipped:!0};const n=await fetch(`${t}/api/ripples`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});if(!n.ok)throw new Error(`postRipple ${n.status}`);return n.json().catch(()=>({}))}async function ot(){const o=W();if(!o)return;const t=await fetch(`${o}/api/ripples`,{method:"DELETE"});if(!t.ok&&t.status!==404)throw new Error(`deleteAllRipples ${t.status}`)}const N=document.getElementById("stage"),d=document.createElement("canvas");d.style.cssText="display:block;width:100%;height:100%";N.appendChild(d);const Y=d.getContext("webgl2",{alpha:!0,antialias:!0,premultipliedAlpha:!1});if(!Y)throw N.innerHTML='<p style="color:#aaa;padding:2rem;font-family:system-ui">WebGL2 is required.</p>',new Error("WebGL2 unavailable");const H=new nt(Y),_=new Q,X=10,M=h.DOT_R*.32,rt=160;let x=1,y=1,b=1,S=1,B=null,p=null;function V(o,t,n,e,r,i,s,a,l,c){const u=n-o,f=e-t,m=Math.hypot(u,f);if(m<.05)return;if(m<M){const T=F(n,e,a,x,y,b,S,l,c);_.addMany([{nx:T.nx,ny:T.ny,x:n,y:e,r,g:i,b:s}]);return}const E=u/m,w=f/m,v=[];let g=M,D=0;for(;g<=m+.01&&D<rt;){const T=Math.min(g,m);v.push({x:o+E*T,y:t+w*T}),g+=M,D++}const $=v.map(T=>{const I=F(T.x,T.y,a,x,y,b,S,l,c);return{nx:I.nx,ny:I.ny,x:T.x,y:T.y,r,g:i,b:s}});_.addMany($)}function q(){const o=Math.min(window.devicePixelRatio||1,2),t=window.innerWidth,n=window.innerHeight;d.width=Math.floor(t*o),d.height=Math.floor(n*o),b=d.width,S=d.height;const e=K(t,n),{tilesX:r,tilesY:i}=e,s=j(r,i);x=s.worldW,y=s.worldH;const a=k(r,i);H.setDotPositions(a);const l=d.getBoundingClientRect();_.remapToWorld(l,x,y,d.width,d.height,t,n),A()}function A(){const o=J(x,y,d.width,d.height);H.draw(o,_.items)}q();window.addEventListener("resize",()=>{clearTimeout(B),B=setTimeout(()=>{q()},120)});_.subscribe(()=>A());const C=()=>window.innerWidth,P=()=>window.innerHeight;function it(o){if(o.button!==0)return;if(o.shiftKey){_.clear(),ot().catch(e=>console.warn(e)),p=null,A();return}const t=d.getBoundingClientRect(),n=L(o.clientX,o.clientY,t,x,y,b,S);p={startCX:o.clientX,startCY:o.clientY,lastSample:{x:n.x,y:n.y},pointerId:o.pointerId};try{d.setPointerCapture(o.pointerId)}catch{}A()}function st(o){if(!p||o.pointerId!==p.pointerId)return;const t=d.getBoundingClientRect(),n=L(o.clientX,o.clientY,t,x,y,b,S),e=G(o.clientX/C(),o.clientY/P());V(p.lastSample.x,p.lastSample.y,n.x,n.y,e.r,e.g,e.b,t,C(),P()),p.lastSample={x:n.x,y:n.y},A()}async function at(o){if(!p||o.pointerId!==p.pointerId)return;try{d.releasePointerCapture(o.pointerId)}catch{}const t=d.getBoundingClientRect(),n=L(o.clientX,o.clientY,t,x,y,b,S),e=o.clientX/C(),r=o.clientY/P(),i=G(e,r),s=o.clientX-p.startCX,a=o.clientY-p.startCY;if(s*s+a*a>=X*X){const c=_.items.length;V(p.lastSample.x,p.lastSample.y,n.x,n.y,i.r,i.g,i.b,t,C(),P()),_.items.length===c&&_.add({nx:e,ny:r,x:n.x,y:n.y,r:i.r,g:i.g,b:i.b});const u=_.items[_.items.length-1];try{await U(u)}catch(f){console.warn(f)}}else{const c=_.add({nx:e,ny:r,x:n.x,y:n.y,r:i.r,g:i.g,b:i.b});try{await U(c)}catch(u){console.warn(u)}}p=null,A()}function ct(o){if(!(!p||o.pointerId!==p.pointerId)){try{d.releasePointerCapture(o.pointerId)}catch{}p=null,A()}}d.addEventListener("pointerdown",it);d.addEventListener("pointermove",st);d.addEventListener("pointerup",at);d.addEventListener("pointercancel",ct);
