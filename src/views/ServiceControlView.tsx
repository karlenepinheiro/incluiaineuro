import React, { useState } from 'react';
import { User, Student, ServiceRecord, ServiceDailyChecklist } from '../types';
import { Plus, Calendar, GripVertical, CheckCircle, Edit, Trash2, Download, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { SmartTextarea } from '../components/SmartTextarea';
import { ExportService } from '../services/exportService';

interface Props {
  user: User;
  students: Student[];
  serviceRecords?: ServiceRecord[]; // Added prop
  onAddRecord?: (record: ServiceRecord) => void; // Added prop
  onUpdateRecord?: (record: ServiceRecord) => void;
  onDeleteRecord?: (id: string) => void;
}

const DEFAULT_CHECKLIST: ServiceDailyChecklist = {
  desempenho: 3,
  interacao: 3,
  comportamento: 'adequado',
  progressoAtividade: '',
  estrategiasUsadas: '',
  proximosPassos: '',
};

export const ServiceControlView: React.FC<Props> = ({ user, students, serviceRecords = [], onAddRecord, onUpdateRecord, onDeleteRecord }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<Partial<ServiceRecord>>({
      date: new Date().toISOString().split('T')[0],
      duration: 50,
      attendance: 'Presente',
      dailyChecklist: { ...DEFAULT_CHECKLIST },
  });

  const setChecklist = (updates: Partial<ServiceDailyChecklist>) =>
    setNewRecord(prev => ({ ...prev, dailyChecklist: { ...(prev.dailyChecklist ?? DEFAULT_CHECKLIST), ...updates } as ServiceDailyChecklist }));

  const handleAdd = () => {
      if(!newRecord.studentId || !newRecord.type) return alert("Preencha os campos obrigatórios");
      if(!onAddRecord) return; // Guard

      const student = students.find(s => s.id === newRecord.studentId);
      
      if (editingId && onUpdateRecord) {
          // Update existing
          const updatedRecord: ServiceRecord = {
              id: editingId,
              studentId: newRecord.studentId,
              studentName: student?.name || 'Desconhecido',
              date: newRecord.date || '',
              type: newRecord.type as any,
              professional: user.name,
              duration: newRecord.duration || 50,
              observation: newRecord.observation || '',
              attendance: newRecord.attendance || 'Presente'
          };
          onUpdateRecord(updatedRecord);
          setEditingId(null);
      } else {
          // Add new
          const record: ServiceRecord = {
              id: crypto.randomUUID(),
              studentId: newRecord.studentId,
              studentName: student?.name || 'Desconhecido',
              date: newRecord.date || '',
              type: newRecord.type as any,
              professional: user.name,
              duration: newRecord.duration || 50,
              observation: newRecord.observation || '',
              attendance: newRecord.attendance || 'Presente'
          };
          onAddRecord(record);
      }
      
      setIsAdding(false);
      setShowChecklist(false);
      setNewRecord({ date: new Date().toISOString().split('T')[0], duration: 50, attendance: 'Presente', dailyChecklist: { ...DEFAULT_CHECKLIST } });
  };

  const handleEdit = (record: ServiceRecord) => {
      setNewRecord({ ...record, dailyChecklist: record.dailyChecklist ?? { ...DEFAULT_CHECKLIST } });
      setEditingId(record.id);
      setShowChecklist(!!record.dailyChecklist);
      setIsAdding(true);
  };

  const handleDelete = (id: string) => {
      if (confirm("Tem certeza que deseja excluir este registro?")) {
          if (onDeleteRecord) onDeleteRecord(id);
      }
  };

  const handleDownloadPDF = (record: ServiceRecord) => {
      ExportService.generateServiceRecordPDF(record);
  };

  return (
    <div className="max-w-6xl mx-auto p-8 min-h-screen">
        <div className="flex justify-between items-center mb-8 print:hidden">
            <div>
                <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold mb-2">
                    <CheckCircle size={12}/> Módulo Master
                </div>
                <h1 className="text-2xl font-bold text-gray-800">Controle de Atendimentos</h1>
                <p className="text-gray-500">Registro diário de atendimentos clínicos e AEE com controle de presença.</p>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setIsAdding(true); setEditingId(null); setNewRecord({ date: new Date().toISOString().split('T')[0], duration: 50, attendance: 'Presente' }); }} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-brand-700">
                    <Plus size={18}/> Novo Atendimento
                </button>
            </div>
        </div>

        {/* Audit Header (Print Only) */}
        <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
             <h1 className="text-xl font-bold uppercase text-center">Relatório de Controle de Frequência e Atendimentos</h1>
             <p className="text-center text-sm mt-1">Profissional: {user.name} | Período: {new Date().toLocaleDateString()}</p>
        </div>

        {isAdding && (
            <div className="bg-white p-6 rounded-xl shadow-lg border border-brand-200 mb-8 animate-fade-in-up print:hidden">
                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">{editingId ? 'Editar Registro' : 'Novo Registro'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Aluno</label>
                        <select 
                            className="w-full border p-2 rounded-lg"
                            value={newRecord.studentId}
                            onChange={e => setNewRecord({...newRecord, studentId: e.target.value})}
                        >
                            <option value="">Selecione...</option>
                            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase">Data</label>
                         <input type="date" className="w-full border p-2 rounded-lg" value={newRecord.date} onChange={e => setNewRecord({...newRecord, date: e.target.value})}/>
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase">Tipo</label>
                         <select className="w-full border p-2 rounded-lg" value={newRecord.type} onChange={e => setNewRecord({...newRecord, type: e.target.value as any})}>
                             <option value="">Selecione...</option>
                             <option>AEE</option>
                             <option>Psicologia</option>
                             <option>Fonoaudiologia</option>
                             <option>Psicopedagogia</option>
                         </select>
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase">Frequência</label>
                         <select className="w-full border p-2 rounded-lg" value={newRecord.attendance} onChange={e => setNewRecord({...newRecord, attendance: e.target.value as any})}>
                             <option>Presente</option>
                             <option>Falta</option>
                             <option>Reposição</option>
                         </select>
                    </div>
                </div>
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Observações gerais</label>
                    <SmartTextarea
                        value={newRecord.observation || ''}
                        onChange={v => setNewRecord({...newRecord, observation: v})}
                        rows={3}
                        context="general"
                        placeholder="Descreva o atendimento ou a justificativa da falta..."
                    />
                </div>

                {/* Ficha avaliativa diária */}
                <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowChecklist(!showChecklist)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-sm font-bold text-gray-700"
                    >
                        <span className="flex items-center gap-2"><ClipboardList size={15} className="text-brand-600"/> Ficha Avaliativa Diária (opcional)</span>
                        {showChecklist ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                    </button>

                    {showChecklist && (
                        <div className="p-4 space-y-5">
                            {/* Desempenho */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Desempenho na Atividade</label>
                                <div className="flex gap-2">
                                    {([1,2,3,4,5] as const).map(v => (
                                        <button key={v} type="button"
                                            onClick={() => setChecklist({ desempenho: v })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${newRecord.dailyChecklist?.desempenho === v ? 'bg-brand-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >{v}</button>
                                    ))}
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                                    <span>Não participou</span><span>Excelente desempenho</span>
                                </div>
                            </div>

                            {/* Interação */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Interação Social / com o Profissional</label>
                                <div className="flex gap-2">
                                    {([1,2,3,4,5] as const).map(v => (
                                        <button key={v} type="button"
                                            onClick={() => setChecklist({ interacao: v })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${newRecord.dailyChecklist?.interacao === v ? 'bg-brand-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >{v}</button>
                                    ))}
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                                    <span>Sem interação</span><span>Muito colaborativo</span>
                                </div>
                            </div>

                            {/* Comportamento */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Comportamento Geral</label>
                                <div className="flex gap-2">
                                    {[
                                        { v: 'adequado',         label: 'Adequado',        color: 'bg-green-100 text-green-700' },
                                        { v: 'regular',          label: 'Regular',         color: 'bg-amber-100 text-amber-700' },
                                        { v: 'necessita_suporte',label: 'Necessita Suporte',color: 'bg-red-100 text-red-700' },
                                    ].map(opt => (
                                        <button key={opt.v} type="button"
                                            onClick={() => setChecklist({ comportamento: opt.v as any })}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition border-2 ${newRecord.dailyChecklist?.comportamento === opt.v ? `${opt.color} border-current shadow` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                                        >{opt.label}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Progresso */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Progresso na Atividade</label>
                                <textarea
                                    value={newRecord.dailyChecklist?.progressoAtividade || ''}
                                    onChange={e => setChecklist({ progressoAtividade: e.target.value })}
                                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-300 outline-none resize-none"
                                    rows={2}
                                    placeholder="Descreva o que foi trabalhado e os avanços observados…"
                                />
                            </div>

                            {/* Estratégias */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Estratégias que Funcionaram</label>
                                <textarea
                                    value={newRecord.dailyChecklist?.estrategiasUsadas || ''}
                                    onChange={e => setChecklist({ estrategiasUsadas: e.target.value })}
                                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-300 outline-none resize-none"
                                    rows={2}
                                    placeholder="Estratégias pedagógicas que surtiram efeito nesta sessão…"
                                />
                            </div>

                            {/* Próximos passos */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Próximos Passos / Encaminhamentos</label>
                                <textarea
                                    value={newRecord.dailyChecklist?.proximosPassos || ''}
                                    onChange={e => setChecklist({ proximosPassos: e.target.value })}
                                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-300 outline-none resize-none"
                                    rows={2}
                                    placeholder="O que deve ser continuado ou ajustado no próximo atendimento…"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={() => { setIsAdding(false); setShowChecklist(false); }} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                    <button onClick={handleAdd} className="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700">{editingId ? 'Atualizar' : 'Salvar Registro'}</button>
                </div>
            </div>
        )}

        {/* 10. LISTA COM DRAG CONCEPT */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:border-black print:shadow-none">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b print:bg-gray-200">
                        <tr>
                            <th className="px-4 py-4 w-10 print:hidden"></th>
                            <th className="px-6 py-4 font-bold text-gray-600">Data</th>
                            <th className="px-6 py-4 font-bold text-gray-600">Aluno</th>
                            <th className="px-6 py-4 font-bold text-gray-600">Especialidade</th>
                            <th className="px-6 py-4 font-bold text-gray-600">Status</th>
                            <th className="px-6 py-4 font-bold text-gray-600">Observação</th>
                            <th className="px-6 py-4 font-bold text-gray-600 text-right print:hidden">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 print:divide-black">
                        {serviceRecords.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Nenhum atendimento registrado.</td></tr>}
                        {serviceRecords.map(r => (
                            <React.Fragment key={r.id}>
                              <tr className="hover:bg-gray-50 group">
                                <td className="px-4 py-4 text-gray-300 cursor-move hover:text-gray-500 print:hidden">
                                    <GripVertical size={16}/>
                                </td>
                                <td className="px-6 py-4 font-mono text-gray-600">{new Date(r.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 font-bold text-gray-800">{r.studentName}</td>
                                <td className="px-6 py-4">
                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold print:border print:border-black print:bg-transparent print:text-black">{r.type}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        r.attendance === 'Presente' ? 'bg-green-100 text-green-700' : r.attendance === 'Falta' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                    } print:border print:border-black print:bg-transparent print:text-black`}>
                                        {r.attendance}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500 max-w-xs truncate print:whitespace-normal">{r.observation}</td>
                                <td className="px-6 py-4 text-right print:hidden">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {r.dailyChecklist && (
                                          <button onClick={() => setExpandedRecordId(expandedRecordId === r.id ? null : r.id)} className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded" title="Ficha avaliativa">
                                              <ClipboardList size={16}/>
                                          </button>
                                        )}
                                        <button onClick={() => handleDownloadPDF(r)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Baixar PDF">
                                            <Download size={16}/>
                                        </button>
                                        <button onClick={() => handleEdit(r)} className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded" title="Editar">
                                            <Edit size={16}/>
                                        </button>
                                        <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Excluir">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                </td>
                              </tr>
                              {expandedRecordId === r.id && r.dailyChecklist && (
                                <tr className="bg-brand-50 border-t border-brand-100">
                                  <td colSpan={7} className="px-8 py-4">
                                    <p className="text-[10px] font-bold uppercase text-brand-600 mb-3 flex items-center gap-1.5"><ClipboardList size={12}/> Ficha Avaliativa Diária</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                      <div>
                                        <p className="text-gray-500 font-semibold mb-1">Desempenho</p>
                                        <span className="font-bold text-brand-700">{r.dailyChecklist.desempenho}/5</span>
                                      </div>
                                      <div>
                                        <p className="text-gray-500 font-semibold mb-1">Interação</p>
                                        <span className="font-bold text-brand-700">{r.dailyChecklist.interacao}/5</span>
                                      </div>
                                      <div>
                                        <p className="text-gray-500 font-semibold mb-1">Comportamento</p>
                                        <span className={`font-bold ${r.dailyChecklist.comportamento === 'adequado' ? 'text-green-700' : r.dailyChecklist.comportamento === 'regular' ? 'text-amber-700' : 'text-red-700'}`}>
                                          {r.dailyChecklist.comportamento === 'adequado' ? 'Adequado' : r.dailyChecklist.comportamento === 'regular' ? 'Regular' : 'Necessita Suporte'}
                                        </span>
                                      </div>
                                      {r.dailyChecklist.progressoAtividade && (
                                        <div className="col-span-2 md:col-span-3">
                                          <p className="text-gray-500 font-semibold mb-1">Progresso na Atividade</p>
                                          <p className="text-gray-700">{r.dailyChecklist.progressoAtividade}</p>
                                        </div>
                                      )}
                                      {r.dailyChecklist.estrategiasUsadas && (
                                        <div className="col-span-2 md:col-span-3">
                                          <p className="text-gray-500 font-semibold mb-1">Estratégias que Funcionaram</p>
                                          <p className="text-gray-700">{r.dailyChecklist.estrategiasUsadas}</p>
                                        </div>
                                      )}
                                      {r.dailyChecklist.proximosPassos && (
                                        <div className="col-span-2 md:col-span-3">
                                          <p className="text-gray-500 font-semibold mb-1">Próximos Passos</p>
                                          <p className="text-gray-700">{r.dailyChecklist.proximosPassos}</p>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div className="mt-12 hidden print:flex justify-around pt-8 border-t border-black">
             <div className="text-center">
                 <div className="w-64 border-b border-black mb-2"></div>
                 <p className="font-bold">{user.name}</p>
                 <p className="text-xs">Assinatura do Profissional</p>
             </div>
             <div className="text-center">
                 <div className="w-64 border-b border-black mb-2"></div>
                 <p className="font-bold">Coordenação / Direção</p>
                 <p className="text-xs">Visto Institucional</p>
             </div>
        </div>
    </div>
  );
};