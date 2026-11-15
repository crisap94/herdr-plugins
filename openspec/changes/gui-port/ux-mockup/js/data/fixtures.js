TR.fixtures={};
TR.fixtures.lastSeen={api:180,web:600,jobs:45,docs:20,scratch:130};
TR.fixtures.tabs=[
 {id:'api',space:'shop',name:'Cart totals',st:'blocked',recapAgo:3,goal:'Cart totals match the server within one cent',
  hl:'Needs a decision: rounding rule for multi-currency carts',waitMin:14,
  need:{q:'Round per line or on the total when two currencies are in one cart?',options:['Per line: matches the server, the total can drift by one cent','On the total: matches the receipt, needs a server change']},
  lanes:[{agent:'claude',name:'orchestrator',st:'blocked',ctx:62},{agent:'claude',name:'docs lane',st:'idle',ctx:18}],
  now:['Property tests for line rounding are green','Waiting on the currency rule before touching coupons'],
  next:['Apply the coupon rule before tax','Document the endpoint'],
  decs:[{ago:45,title:'Round at the line level, not the total',why:'The server rounds per line, so totals drift if we round the sum'},{ago:120,title:'Coupons apply before tax',why:'Matches the receipt the customer sees'},{ago:300,title:'Drop the per-currency rounding table',why:'Two currencies are in use; the table was dead code'}],
  links:['MR 42','Ticket SHOP-118','Receipt spec'],
  facts:[{ago:14,kind:'need'},{ago:45,kind:'decision'},{ago:60,kind:'fact'},{ago:100,kind:'fact'},{ago:120,kind:'decision'},{ago:150,kind:'fact'},{ago:170,kind:'fact'},{ago:400,kind:'fact'}]},
 {id:'web',space:'shop',name:'Checkout form',st:'done',recapAgo:9,goal:'Ship the new checkout form',
  hl:'Checkout form merged; review notes are in the MR',waitMin:0,need:null,
  lanes:[{agent:'claude',name:'form lane',st:'done',ctx:38}],
  now:['Merged into main','CI is green'],next:['Announce in the release notes'],
  decs:[{ago:420,title:'Keep the old form behind a flag for a week',why:'Lets support roll back without a deploy'}],links:['MR 51'],
  facts:[{ago:30,kind:'fact'},{ago:200,kind:'fact'},{ago:420,kind:'decision'},{ago:500,kind:'fact'},{ago:700,kind:'fact'}]},
 {id:'jobs',space:'infra',name:'Migrate runner',st:'working',recapAgo:0,goal:'Move the job runner to the new queue',
  hl:'Running the migration dry run on staging (9 of 14)',waitMin:0,need:null,
  lanes:[{agent:'claude',name:'runner',st:'working',ctx:78},{agent:'codex',name:'log reader',st:'working',ctx:31}],
  now:['Dry run on staging: 9 of 14 migrations applied'],next:['Review the dry-run log','Run for real in the maintenance window'],
  decs:[{ago:30,title:'Run the dry run before any real migration',why:'A failed migration here is cheap to undo'}],links:['Runbook'],
  facts:[{ago:5,kind:'fact'},{ago:20,kind:'compaction'},{ago:30,kind:'decision'},{ago:90,kind:'fact'}]},
 {id:'docs',space:'docs',name:'Coupon docs',st:'working',recapAgo:1,goal:'Document the coupon endpoint',
  hl:'Writing the coupon endpoint page',waitMin:0,need:null,
  lanes:[{agent:'claude',name:'writer',st:'working',ctx:24}],
  now:['Drafting request and response examples'],next:['Review with the API lane'],decs:[],links:[],
  facts:[{ago:4,kind:'fact'},{ago:40,kind:'fact'}]},
 {id:'scratch',space:'infra',name:'Spike',st:'idle',recapAgo:120,goal:'Compare queue libraries',
  hl:'Idle for 2 h; last: compared two queue libraries',waitMin:0,need:null,
  lanes:[{agent:'opencode',name:'spike',st:'idle',ctx:12}],
  now:[],next:[],decs:[],links:[],facts:[]}
];
TR.fixtures.story={
  text:'The cart team moved totals to line rounding after the server mismatch, then added coupons before tax. Line rounding is merged; the coupon rule is in review and one question about multi-currency rounding is waiting on you.',
  chapters:[['Server totals audit','Nov 5, 14:20','Found that the client and server disagreed by one cent on mixed carts'],['Line rounding','Nov 6, 10:20','Moved to per-line rounding and wrote the property tests'],['Coupons and currency','Nov 7, 02:20','Coupon rule drafted; multi-currency rounding is open']]
};
TR.fixtures.session={facts:[['3 d','session length'],['41','turns: 9 prompted, 32 by agents'],['2','compactions, 3 chapters'],['18','files edited'],['62%','context, claude'],['feat/cart','3 commits unpushed']]};
TR.fixtures.breaks=[
 {t:0,kind:'chapter',text:'Server totals audit',short:'Ch 1'},{t:20*60,kind:'chapter',text:'Line rounding',short:'Ch 2'},{t:36*60,kind:'chapter',text:'Coupons and currency',short:'Ch 3'},
 {t:15*60,kind:'compaction',text:'Compacted 71% to 18%',short:'compact'},{t:41*60,kind:'compaction',text:'Compacted 74% to 20%',short:'compact'},
 {t:24.5*60,kind:'session',text:'New session started',short:'new session'}
];
(function(){
 let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
 const pick=a=>a[Math.floor(rnd()*a.length)];
 const subj=['line rounding','coupon rule','receipt copy','currency table','tax step','cart schema','totals endpoint','property tests','server mismatch','discount stacking'];
 const text={
  progress:['Working on the %','Reading the code for the %','Rewriting the %','Running checks on the %'],
  done:['Finished the %','Merged the %','Tests pass for the %','Shipped the %'],
  decisions:['Decided how to handle the %','Keep the % as it is','Change the % to match the server'],
  needs:['Need input on the %','Which option for the %?','Blocked on the %']
 };
 const bursts=[[3,2,14],[9,2,16],[17,1.5,12],[22,2,20],[28,3,14],[33,1.5,10],[38,2,18],[43,2,16],[47.2,.8,12]];
 const ev=[];
 bursts.forEach(([c,w,n])=>{for(let i=0;i<n;i++){
  const r=rnd(),sec=r<.45?'progress':r<.7?'done':r<.85?'decisions':'needs';
  const h=Math.min(47.9,Math.max(0,c+(rnd()-.5)*2*w));
  ev.push({t:Math.round(h*60),sec,text:pick(text[sec]).replace('%',pick(subj))})}});
 TR.fixtures.events=ev.sort((a,b)=>a.t-b.t);
})();
