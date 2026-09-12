// Dependency-injected handler: authentication precedes parsing and every database call.
export function createKiwifyHandler(secret: string, process: (event: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    const reply=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
    if(req.method!=='POST') return reply({error:'Method not allowed'},405);
    if(!secret) return reply({error:'Webhook unavailable'},503);
    const supplied=req.headers.get('kiwify-signature')??req.headers.get('x-kiwify-signature')??req.headers.get('signature')??'';
    const enc=new TextEncoder();
    const a=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(secret)));
    const b=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(supplied)));
    let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
    if(diff!==0||!supplied) return reply({error:'Unauthorized'},401);
    let payload: any;
    try {const raw=await req.text();if(raw.length>1_000_000) return reply({error:'Payload too large'},413);payload=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return reply({error:'Invalid payload'},400);
    const order=payload.order??payload;
    const customer=order.customer??order.Customer??payload.Customer??payload.customer??{};
    const product=payload.Product??payload.product??order.Product??order.product??{};
    const rawEvent=String(payload.event??payload.order_status??payload.payment_status??payload.type??'').toLowerCase();
    const paid=['paid','approved','order_approved','subscription_first_charge','subscription_activated','subscription_renewed'];
    const canceled=['refunded','chargedback','order_refunded','chargeback','subscription_canceled','subscription_cancelled'];
    const event=paid.includes(rawEvent)?'paid':canceled.includes(rawEvent)?'canceled':rawEvent==='subscription_overdue'?'overdue':null;
    if(!event)return reply({ignored:true});
    const orderId=String(payload.order_id??order.order_id??order.id??'').trim();
    const email=String(customer.email??customer.Email??payload.customer_email??'').trim().toLowerCase();
    const productId=String(product.product_id??product.id??product.Id??payload.product_id??'').trim();
    if(!orderId||!email||!productId)return reply({error:'Missing order, buyer or product'},422);
    let paidAt: string|null=null;
    for(const key of ['approved_date','payment_date','paid_date','paidAt','paid_at','approved_at']) {
      const value=order[key]??payload[key]; if(value==null)continue;
      const text=String(value); const br=text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
      const date=new Date(br?`${br[3]}-${br[2]}-${br[1]}T${br[4]??'00:00:00'}-03:00`:/^\d{10,13}$/.test(text)?Number(text)*(text.length===10?1000:1):text);
      if(Number.isFinite(date.getTime())){paidAt=date.toISOString();break;}
    }
    if(event==='paid'&&!paidAt)return reply({error:'Payment date required'},422);
    try {
      // Deliberately omit tracking, tenant, credit amount, plan and product name.
      return reply(await process({p_order_id:orderId,p_event:event,p_email:email,p_product_id:productId,p_paid_at:paidAt}));
    } catch {return reply({error:'Transaction failed; retry with the same order'},500);}
  };
}
