const moneyKeys=['tuition','upfront','transport','meals','housing','other'];
export function calculateBudget(values){
  for(const key of moneyKeys)if(typeof values[key]!=='number'||!Number.isFinite(values[key])||values[key]<0||values[key]>100000000)throw new RangeError('Valor monetário inválido.');
  for(const key of ['installments','months'])if(!Number.isInteger(values[key])||values[key]<1||values[key]>24)throw new RangeError('Período inválido.');
  const cents=key=>Math.round(values[key]*100);
  const tuition=cents('tuition')*values.installments;
  const living=['transport','meals','housing','other'].reduce((sum,key)=>sum+cents(key),0)*values.months;
  const upfront=cents('upfront');
  return {tuition:tuition/100,living:living/100,upfront:upfront/100,total:(tuition+living+upfront)/100};
}
export function setupBudget({download,demoHeader}){
  const form=document.querySelector('#study-budget-form');if(!form)return;
  const result=document.querySelector('#budget-result'),state=document.querySelector('#budget-state');
  const format=value=>new Intl.NumberFormat('pt-AO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' Kz';
  let current=null;
  function invalidate(message){current=null;result.hidden=true;state.textContent=message;}
  form.addEventListener('input',()=>invalidate('Os valores foram alterados. Calcule para actualizar a estimativa.'));
  form.addEventListener('change',()=>invalidate('Os valores foram alterados. Calcule para actualizar a estimativa.'));
  form.addEventListener('reset',()=>invalidate('Preencha os campos para calcular a sua estimativa.'));
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const values=Object.fromEntries([...moneyKeys,'installments','months'].map(key=>[key,Number(form.elements.namedItem(key).value)]));
    try{
      const amounts=calculateBudget(values);current={values,amounts};
      for(const key of ['tuition','living','upfront','total'])document.querySelector('#budget-'+key).textContent=format(amounts[key]);
      document.querySelector('#budget-formula').textContent=values.installments+' prestações de propina + '+values.months+' meses de despesas do dia a dia + despesas únicas.';
      result.hidden=false;result.focus({preventScroll:true});result.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduce-motion')?'auto':'smooth'});state.textContent='Estimativa calculada: '+format(amounts.total)+'. Baseada apenas nos valores que introduziu.';
    }catch{invalidate('Verifique os valores e os períodos antes de calcular.');}
  });
  document.querySelector('#budget-download').addEventListener('click',()=>{
    if(!current)return;
    const {values,amounts}=current;
    const rows=[['Prestação de propina',values.tuition],['Transporte mensal',values.transport],['Alimentação mensal',values.meals],['Alojamento mensal',values.housing],['Outras despesas mensais',values.other],['Despesas únicas',values.upfront]];
    download('ispab-estimativa-pessoal.txt',demoHeader()+'PLANEAMENTO PESSOAL DE CUSTOS\nValores introduzidos pelo visitante; não são preços oficiais.\n\n'+rows.map(([label,value])=>label+': '+format(value)).join('\n')+'\nPrestações consideradas: '+values.installments+'\nMeses considerados: '+values.months+'\n\nPropinas no período: '+format(amounts.tuition)+'\nDia a dia no período: '+format(amounts.living)+'\nDespesas únicas: '+format(amounts.upfront)+'\nTOTAL ESTIMADO: '+format(amounts.total)+'\n\nInclui apenas as despesas introduzidas. Não representa dívida, cobrança, bolsa ou referência de pagamento.\n');
  });
}
