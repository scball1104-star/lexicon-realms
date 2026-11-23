const r=require(require('path').resolve(process.argv[2]));
console.log('levels',r.levels.map(l=>l.level+':'+l.min).join(' '));
console.log('deaths\n'+r.deaths.map(d=>[d.min,'L'+d.level,d.zone,d.tile.join(','),d.killer+'@'+d.killerLevel,d.goal,d.wokeAt].join(' ')).join('\n'));
console.log('viol',JSON.stringify(r.violations));
console.log('stuck',JSON.stringify(r.stuck));
console.log('quests',Object.entries(r.quests).map(([k,v])=>k+' '+v.accept+'/'+v.ready+'/'+v.done+(v.fails?' fails'+v.fails:'')).join('\n'));
console.log('counters',JSON.stringify(r.counters));
console.log('trainer',JSON.stringify(r.trainer));
console.log('goldBy',JSON.stringify(r.goldBy),'errors',JSON.stringify(r.errors).slice(0,2000));
