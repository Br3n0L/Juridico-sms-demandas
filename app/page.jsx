'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

const SETORES = [
  "Gabinete","Assessoria Jurídica","Diretoria de Administração","Licitações/Compras",
  "Regulação","Atenção Básica","Vigilância em Saúde","Financeiro","Outros",
];

function uid(len=6){ const s=Math.random().toString(36).slice(2); return s.slice(0,len).toUpperCase(); }
function fmtDateTime(s){ if(!s) return '—'; const d=new Date(s); return d.toLocaleString(); }
function gerarProtocolo(date=new Date(), seq=uid(4)){ const y=date.getFullYear(); const m=String(date.getMonth()+1).padStart(2,'0'); const d=String(date.getDate()).padStart(2,'0'); return `SMSJ-${y}${m}${d}-${seq}`; }
function slaBadge(prazo){
  if(!prazo) return {label:'Sem prazo', cls:'badge gray'};
  const now=new Date(); const end=new Date(prazo); const diffH=(end-now)/36e5;
  if(diffH<0) return {label:'Vencido', cls:'badge red'};
  if(diffH<=24) return {label:'24h', cls:'badge red'};
  if(diffH<=72) return {label:'72h', cls:'badge'};
  return {label:'> 72h', cls:'badge gray'};
}
function toICS(d){
  const dtStart=new Date(d.prazo || Date.now());
  const dtEnd=new Date(dtStart.getTime()+3600*1000);
  const fmt=(x)=>x.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const ics=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SMSJ//Demanda//PT-BR','BEGIN:VEVENT',
    `UID:${d.id}@smsj`,`DTSTAMP:${fmt(new Date())}`,`DTSTART:${fmt(dtStart)}`,`DTEND:${fmt(dtEnd)}`,
    `SUMMARY:Prazo – ${d.titulo}`,
    `DESCRIPTION:Protocolo ${d.protocolo} | Responsável: ${d.responsavel||'—'} | Origem: ${d.origem||'—'}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\n');
  return new Blob([ics],{type:'text/calendar;charset=utf-8'});
}

export default function Page(){
  const [demandas,setDemandas]=useState(()=>{
    try{ const raw=localStorage.getItem('smsjur-demandas-v1'); return raw?JSON.parse(raw):[] }catch{ return [] }
  });
  const [responsaveis,setResponsaveis]=useState(()=>{
    try{ const raw=localStorage.getItem('smsjur-responsaveis-v1'); return raw?JSON.parse(raw):['Patrícia Cadeira','Breno Leal','Bartolomeu Neto','Ingrid Paloma'] }catch{ return ['Patrícia Cadeira','Breno Leal','Equipe Licitações'] }
  });
  const [form,setForm]=useState({ titulo:'', origem:'', setor:'Assessoria Jurídica', descricao:'', prioridade:'media', prazo:'', responsavel:'' });
  const [novoResp,setNovoResp]=useState('');
  const [filtro,setFiltro]=useState({ texto:'', status:'todas', prioridade:'todas', setor:'todos' });
  const [recibo,setRecibo]=useState(null);
  const [qr,setQr]=useState('');
  const modalRef=useRef(null);
  const reciboRef=useRef(null);

  useEffect(()=>{ try{ localStorage.setItem('smsjur-demandas-v1', JSON.stringify(demandas)); }catch{} },[demandas]);
  useEffect(()=>{ try{ localStorage.setItem('smsjur-responsaveis-v1', JSON.stringify(responsaveis)); }catch{} },[responsaveis]);
  useEffect(()=>{
    if(recibo){
      const texto=`Protocolo ${recibo.protocolo} | Recebido por ${recibo.recebidoPor||'—'} em ${fmtDateTime(recibo.recebidoEm)}`;
      QRCode.toDataURL(texto,{margin:1,scale:6}).then(setQr).catch(()=>setQr(''));
      modalRef.current?.showModal();
    } else {
      modalRef.current?.close();
      setQr('');
    }
  },[recibo]);

  const filtradas = useMemo(()=>{
    return demandas.filter(d=>{
      const t=(filtro.texto||'').toLowerCase();
      const okT=!t || [d.titulo,d.origem,d.protocolo,d.descricao,d.responsavel].some(x=>(x||'').toLowerCase().includes(t));
      const okS=filtro.status==='todas'||d.status===filtro.status;
      const okP=filtro.prioridade==='todas'||d.prioridade===filtro.prioridade;
      const okSe=filtro.setor==='todos'||d.setor===filtro.setor;
      return okT&&okS&&okP&&okSe;
    }).sort((a,b)=>new Date(b.criadoEm)-new Date(a.criadoEm));
  },[demandas,filtro]);

  function addDemanda(e){
    e?.preventDefault?.();
    if(!form.titulo.trim()){ alert('Informe um título.'); return; }
    const now=new Date();
    const nova={
      id:crypto.randomUUID(), protocolo:gerarProtocolo(now),
      titulo:form.titulo.trim(), origem:form.origem.trim(), setor:form.setor,
      descricao:form.descricao.trim(), prioridade:form.prioridade, prazo:form.prazo||null,
      responsavel:form.responsavel||'', status:'nova', criadoEm:now.toISOString(),
      recebidoPor:form.responsavel||'', recebidoEm: form.responsavel? now.toISOString(): null,
      historico:[ {t:now.toISOString(),a:'criada'}, form.responsavel?{t:now.toISOString(),a:`atribuída a ${form.responsavel}`} : null ].filter(Boolean)
    };
    setDemandas(prev=>[nova,...prev]);
    setForm({ titulo:'', origem:'', setor:'Assessoria Jurídica', descricao:'', prioridade:'media', prazo:'', responsavel:'' });
  }
  function atualizarDemanda(id,patch){ setDemandas(prev=>prev.map(d=>d.id===id?{...d,...patch}:d)); }
  function excluirDemanda(id){ if(confirm('Excluir esta demanda?')) setDemandas(prev=>prev.filter(d=>d.id!==id)); }
  function marcarRecebido(d){ const now=new Date().toISOString(); atualizarDemanda(d.id,{recebidoPor:d.responsavel||'', recebidoEm:now}); setRecibo({...d,recebidoPor:d.responsavel||'', recebidoEm:now}); }
  function baixarICS(d){ const blob=toICS(d); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${d.protocolo}.ics`; a.click(); URL.revokeObjectURL(url); }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 style={{margin:'0 0 4px 0'}}>Recepção de Demandas – SMS</h1>
          <div style={{color:'#64748b', fontSize:12}}>Protocolo, prazos e recibos com quem recebeu</div>
        </div>
        <div className="search">
          <input type="text" placeholder="Buscar..." value={filtro.texto} onChange={(e)=>setFiltro(f=>({...f,texto:e.target.value}))} />
          <select value={filtro.setor} onChange={(e)=>setFiltro(f=>({...f,setor:e.target.value}))}>
            <option value="todos">Todos os setores</option>
            {SETORES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Nova demanda</h2></div>
        <div className="card-content">
          <div className="row">
            <div>
              <label>Título *</label>
              <input type="text" value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} placeholder="Ex.: Parecer sobre contrato"/>
            </div>
            <div>
              <label>Origem</label>
              <input type="text" value={form.origem} onChange={e=>setForm(f=>({...f,origem:e.target.value}))} placeholder="Ex.: Gabinete / e-mail / ofício"/>
            </div>
            <div>
              <label>Setor</label>
              <select value={form.setor} onChange={e=>setForm(f=>({...f,setor:e.target.value}))}>
                {SETORES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label>Prioridade</label>
              <select value={form.prioridade} onChange={e=>setForm(f=>({...f,prioridade:e.target.value}))}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label>Prazo (data/hora)</label>
              <input type="datetime-local" value={form.prazo||''} onChange={e=>setForm(f=>({...f,prazo:e.target.value}))}/>
            </div>
            <div>
              <label>Responsável</label>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <select value={form.responsavel} onChange={e=>setForm(f=>({...f,responsavel:e.target.value}))} style={{flex:1}}>
                  <option value="">—</option>
                  {responsaveis.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
                <input type="text" placeholder="Novo responsável" value={novoResp} onChange={e=>setNovoResp(e.target.value)} />
                <button className="button outline" onClick={()=>{
                  const n=novoResp.trim(); if(!n) return; setResponsaveis(prev=>[...new Set([...prev,n])]); setNovoResp('');
                }}>Adicionar</button>
              </div>

              {/* Lista de responsáveis com opção de excluir */}
              <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
                {responsaveis.map(r=>(
                  <div key={r} style={{display:'flex', alignItems:'center', gap:6, background:'#f3f4f6', padding:'4px 8px', borderRadius:6}}>
                    <span style={{fontSize:13}}>{r}</span>
                    <button
                      className="button outline"
                      style={{padding:'4px 6px'}}
                      onClick={()=>{
                        if(!confirm(`Remover responsável "${r}"? Isso também desvinculará demandas atribuídas a ele.`)) return;
                        setResponsaveis(prev=>prev.filter(x=>x!==r));
                        setDemandas(prev=>prev.map(d=>d.responsavel===r?{...d,responsavel:''}:d));
                        // se o formulário atual apontava para esse responsável, limpar
                        setForm(f=> f.responsavel===r ? {...f,responsavel:''} : f);
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="row-1">
              <div>
                <label>Descrição</label>
                <textarea value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Detalhes da demanda..."/>
              </div>
            </div>
          </div>
          <div className="actions" style={{marginTop:12}}>
            <button className="button" onClick={addDemanda}>Registrar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Demandas</h2></div>
        <div className="card-content">
          <div className="row">
            <div>
              <label>Status</label>
              <select value={filtro.status} onChange={e=>setFiltro(f=>({...f,status:e.target.value}))}>
                <option value="todas">Todos os status</option>
                <option value="nova">Nova</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label>Prioridade</label>
              <select value={filtro.prioridade} onChange={e=>setFiltro(f=>({...f,prioridade:e.target.value}))}>
                <option value="todas">Todas</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <table className="table" style={{marginTop:12}}>
            <thead>
              <tr>
                <th>Protocolo</th><th>Título</th><th>Setor</th><th>Prioridade</th><th>Prazo</th><th>Status</th><th>Responsável</th><th style={{textAlign:'right'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(d=>{
                const sla=slaBadge(d.prazo);
                return (
                  <tr key={d.id}>
                    <td style={{fontWeight:600}}>{d.protocolo}</td>
                    <td>
                      <div style={{fontWeight:600}}>{d.titulo}</div>
                      <div style={{fontSize:12, color:'#64748b'}}>{d.origem||'—'}</div>
                    </td>
                    <td>{d.setor}</td>
                    <td><span className={`badge ${d.prioridade==='urgente'?'red': d.prioridade==='alta'?'':'gray'}`}>{d.prioridade}</span></td>
                    <td>
                      <div className="sla">
                        <span>{d.prazo? fmtDateTime(d.prazo): '—'}</span>
                        <span className={sla.cls}>{sla.label}</span>
                      </div>
                    </td>
                    <td>
                      <select value={d.status} onChange={e=>atualizarDemanda(d.id,{status:e.target.value})}>
                        <option value="nova">Nova</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluida">Concluída</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </td>
                    <td>
                      <select value={d.responsavel} onChange={e=>atualizarDemanda(d.id,{responsavel:e.target.value})}>
                        <option value="">—</option>
                        {responsaveis.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{textAlign:'right'}}>
                      <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
                        <button className="button outline" onClick={()=>setRecibo(d)}>Recibo</button>
                        <button className="button outline" onClick={()=>marcarRecebido(d)}>Receber</button>
                        <button className="button outline" disabled={!d.prazo} onClick={()=>baixarICS(d)}>ICS</button>
                        <button className="button secondary" onClick={()=>excluirDemanda(d.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{marginTop:8, color:'#64748b', fontSize:12}}>{filtradas.length} demanda(s) encontradas</div>
        </div>
      </div>

      <dialog ref={modalRef} className="modal" onClose={()=>setRecibo(null)}>
        <div className="wrap">
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:18, fontWeight:700}}>Secretaria Municipal de Saúde – Recebido</div>
              <div style={{color:'#64748b', fontSize:12}}>Gerado em {new Date().toLocaleString()}</div>
            </div>
            {qr? <img src={qr} className="qr" alt="QR"/> : <div className="badge">QR</div>}
          </div>
          {recibo && (
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}} ref={reciboRef}>
              <div>
                <div><b>Protocolo:</b> {recibo.protocolo}</div>
                <div><b>Título:</b> {recibo.titulo}</div>
                <div><b>Origem:</b> {recibo.origem||'—'}</div>
                <div><b>Setor:</b> {recibo.setor}</div>
                <div><b>Prioridade:</b> {recibo.prioridade}</div>
              </div>
              <div>
                <div><b>Prazo:</b> {recibo.prazo? fmtDateTime(recibo.prazo): '—'}</div>
                <div><b>Recebido por:</b> {recibo.recebidoPor || recibo.responsavel || '—'}</div>
                <div><b>Data/Hora do recebimento:</b> {fmtDateTime(recibo.recebidoEm)}</div>
                <div style={{color:'#64748b', fontSize:12}}>ID: {recibo.id}</div>
              </div>
              <div style={{gridColumn:'1 / -1', marginTop:8}}>
                <b>Descrição:</b>
                <div>{recibo.descricao || '—'}</div>
              </div>
            </div>
          )}
          <div className="actions" style={{marginTop:12}}>
            <button className="button outline" onClick={()=>{ window.print(); }}>Imprimir/Salvar PDF</button>
            <button className="button" onClick={()=>{ modalRef.current?.close(); setRecibo(null); }}>Fechar</button>
          </div>
        </div>
      </dialog>

      <footer>
        Dica: pressione <kbd>/</kbd> para focar a busca.
      </footer>
    </div>
  );
}
