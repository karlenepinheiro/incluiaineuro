import React, { useState } from 'react';
import { User, Student } from '../types';
import { ArrowLeft, Printer, Save, Search } from 'lucide-react';
import { SmartTextarea } from '../components/SmartTextarea';

interface Props {
  user: User;
  students: Student[];
  onBack: () => void;
}

export const SchoolReportView: React.FC<Props> = ({ user, students, onBack }) => {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [content, setContent] = useState({
      evolution: '',
      recommendations: '',
      adaptations: ''
  });

  const school = user.schoolConfigs[0];

  if (!selectedStudent) {
      const filtered = students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return (
          <div className="max-w-4xl mx-auto py-12 px-4">
               <button onClick={onBack} className="text-gray-500 mb-6 flex items-center gap-2 hover:text-brand-600"><ArrowLeft size={20}/> Voltar</button>
               <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Relatório Clínico para Escola</h2>
               <p className="text-center text-gray-500 mb-8">Documento formal de devolutiva para a equipe escolar.</p>
               <div className="relative mb-6">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
                   <input className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-500 outline-none" placeholder="Buscar aluno..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <div className="grid md:grid-cols-2 gap-4">
                   {filtered.map(s => (
                       <button key={s.id} onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-500 hover:shadow-md transition text-left">
                           <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">{s.name.charAt(0)}</div>
                           <div><p className="font-bold text-gray-800">{s.name}</p><p className="text-xs text-gray-500">{s.grade}</p></div>
                       </button>
                   ))}
               </div>
          </div>
      );
  }

  return (
    <div className="max-w-[210mm] mx-auto bg-white min-h-screen p-[20mm] shadow-lg print:shadow-none print:w-full print:m-0">
        <div className="flex justify-between print:hidden mb-8">
            <button onClick={() => setSelectedStudent(null)} className="text-gray-500 hover:text-brand-600 flex items-center gap-2"><ArrowLeft size={16}/> Trocar Aluno</button>
            <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Printer size={16}/> Imprimir</button>
            </div>
        </div>

        {/* HEADER */}
        <div className="flex items-center gap-4 border-b-2 border-black pb-6 mb-8">
             {school?.logoUrl ? <img src={school.logoUrl} className="h-20 w-auto"/> : <div className="h-16 w-16 bg-gray-200 flex items-center justify-center font-bold text-xs">LOGO</div>}
             <div className="flex-1">
                 <h1 className="text-xl font-bold uppercase">{school?.schoolName || 'INSTITUIÇÃO DE ENSINO'}</h1>
                 <p className="text-sm font-semibold">Relatório de Acompanhamento Especializado</p>
                 <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
             </div>
        </div>

        <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded text-sm">
            <div className="grid grid-cols-2 gap-2">
                <p><span className="font-bold">Aluno:</span> {selectedStudent.name}</p>
                <p><span className="font-bold">Data Nasc:</span> {new Date(selectedStudent.birthDate).toLocaleDateString()}</p>
                <p><span className="font-bold">Série:</span> {selectedStudent.grade}</p>
                <p><span className="font-bold">Profissional:</span> {user.name}</p>
            </div>
        </div>

        {/* CONTENT */}
        <div className="space-y-8 text-sm leading-relaxed text-justify font-serif">
            
            <section>
                <h3 className="font-bold text-base border-b border-gray-300 mb-2 uppercase">1. Evolução e Desenvolvimento</h3>
                <p className="text-gray-500 text-xs mb-2 italic print:hidden">Descreva os avanços percebidos no período.</p>
                <SmartTextarea 
                    value={content.evolution} 
                    onChange={v => setContent({...content, evolution: v})} 
                    rows={6}
                    context="general"
                    placeholder="O aluno demonstrou avanços em..."
                />
            </section>

            <section>
                <h3 className="font-bold text-base border-b border-gray-300 mb-2 uppercase">2. Adaptações Curriculares Realizadas</h3>
                <p className="text-gray-500 text-xs mb-2 italic print:hidden">Liste as estratégias que funcionaram.</p>
                <SmartTextarea 
                    value={content.adaptations} 
                    onChange={v => setContent({...content, adaptations: v})} 
                    rows={4}
                    context="cognitive"
                    placeholder="Utilização de material concreto, tempo estendido..."
                />
            </section>

            <section>
                <h3 className="font-bold text-base border-b border-gray-300 mb-2 uppercase">3. Recomendações para a Escola</h3>
                <p className="text-gray-500 text-xs mb-2 italic print:hidden">Sugestões para a equipe docente.</p>
                <SmartTextarea 
                    value={content.recommendations} 
                    onChange={v => setContent({...content, recommendations: v})} 
                    rows={5}
                    context="social"
                    placeholder="Sugere-se manter a rotina visual..."
                />
            </section>
        </div>

        {/* SIGNATURES */}
        <div className="mt-24 pt-8 border-t border-gray-300 flex justify-between gap-8">
            <div className="flex-1 text-center">
                <div className="h-px bg-black mb-2"></div>
                <p className="font-bold text-sm">{user.name}</p>
                <p className="text-xs">Especialista em Educação Inclusiva</p>
            </div>
            <div className="flex-1 text-center">
                <div className="h-px bg-black mb-2"></div>
                <p className="font-bold text-sm">{school?.managerName}</p>
                <p className="text-xs">Direção / Coordenação</p>
            </div>
        </div>
        
        <div className="mt-12 text-center text-[10px] text-gray-400">
            Documento gerado via IncluiAI - Protegido pela LGPD.
        </div>
    </div>
  );
};