
(function(){
const canvas=document.createElement('canvas');
canvas.id='matrix-rain';
Object.assign(canvas.style,{position:'fixed',top:'0',left:'0',width:'100%',height:'100%',zIndex:'-1',pointerEvents:'none'});
document.body.prepend(canvas);
const ctx=canvas.getContext('2d');
function resize(){canvas.width=innerWidth;canvas.height=innerHeight;}
resize(); addEventListener('resize',resize);
const chars='アイウエオカキクケコサシスセソ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const fontSize=16;
let columns=Math.floor(window.innerWidth/fontSize);
let drops=Array(columns).fill(1);
function reset(){columns=Math.floor(window.innerWidth/fontSize);drops=Array(columns).fill(1);}
addEventListener('resize',reset);
function draw(){
ctx.fillStyle='rgba(0,0,0,0.08)';
ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.fillStyle='#00ff66';
ctx.font=fontSize+'px monospace';
for(let i=0;i<drops.length;i++){
 const text=chars[Math.floor(Math.random()*chars.length)];
 ctx.fillText(text,i*fontSize,drops[i]*fontSize);
 if(drops[i]*fontSize>canvas.height && Math.random()>0.975) drops[i]=0;
 drops[i]++;
}
requestAnimationFrame(draw);
}
draw();
})();
