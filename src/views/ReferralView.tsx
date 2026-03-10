import React, { useState } from 'react';
import { User, Student, DocumentType } from '../types';
import { ArrowLeft, Printer, Save, Search } from 'lucide-react';
import { SmartTextarea } from '../components/SmartTextarea';

interface Props {
  user: User;
  students: Student[];
  onBack: () => void;
}

export const ReferralView: React.FC<Props> = ({ user, students, onBack }) => {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [reason, setReason] = useState('');
  const [observations, setObservations] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const school = user.schoolConfigs[0];

  if (!selectedStudent) {
      const filtered = students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return (
          <div className="max-w-4xl mx-auto py-12 px-4">
               <button onClick={onBack} className="text-gray-500 mb-6 flex items-center gap-2 hover:text-brand-600"><ArrowLeft size={20}/> Voltar</button>
               <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Encaminhamento para PEI</h2>
               <p className="text-center text-gray-500 mb-8">Selecione o aluno para gerar o documento oficial.</p>
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

        {/* DOCUMENT HEADER */}
        <div className="text-center border-b-2 border-brand-900 pb-4 mb-8">
            <h1 className="text-xl font-bold uppercase text-brand-900">ENCAMINHAMENTO PARA ELABORAÇÃO DE PEI</h1>
            <h2 className="text-sm font-semibold text-gray-600">Plano Educacional Individualizado</h2>
        </div>

        {/* BODY */}
        <div className="space-y-6 text-justify text-sm leading-relaxed font-serif">
            <p className="font-bold">À Direção / Coordenação Pedagógica</p>
            
            <p>
                Encaminha-se o(a) estudante <span className="font-bold border-b border-black px-2">{selectedStudent.name}</span>,
                matriculado(a) no <span className="font-bold border-b border-black px-2">{selectedStudent.grade}</span>, 
                turma <span className="font-bold border-b border-black px-2">{selectedStudent.shift}</span>, 
                para elaboração do <strong>Plano Educacional Individualizado (PEI)</strong>, considerando observações pedagógicas, 
                necessidades educacionais específicas e a importância de estratégias diferenciadas no processo de ensino e aprendizagem.
            </p>

            <div className="bg-gray-50 p-6 border border-gray-200 rounded-lg my-6">
                <h3 className="font-bold mb-2 text-brand-800">O PEI tem como finalidade:</h3>
                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>Planejar intervenções pedagógicas individualizadas;</li>
                    <li>Definir objetivos de aprendizagem possíveis e funcionais;</li>
                    <li>Favorecer a aprendizagem significativa e a participação do(a) estudante;</li>
                    <li>Orientar professores, profissionais de apoio e demais envolvidos;</li>
                    <li>Garantir acompanhamento contínuo e avaliação do progresso escolar.</li>
                </ul>
            </div>

            <div>
                <label className="block font-bold mb-1">Motivo do Encaminhamento / Observações Iniciais:</label>
                <SmartTextarea 
                    value={reason} 
                    onChange={setReason} 
                    rows={6} 
                    placeholder="Descreva as principais dificuldades observadas..."
                    context="general"
                />
            </div>

            <p className="italic text-gray-500 text-xs mt-4">
                Sugere-se que o PEI seja construído de forma colaborativa, envolvendo equipe pedagógica, professores, família e, quando possível, profissionais externos que acompanham o(a) estudante.
            </p>
            
            <div className="mt-8">
                <p>Diante do exposto, solicita-se o agendamento de reunião para estudo de caso.</p>
                <p className="mt-4">Data: {new Date().toLocaleDateString()}</p>
            </div>

            {/* SIGNATURES */}
            <div className="mt-20 pt-8 border-t border-gray-300">
                <p className="mb-8">Nome do responsável pelo encaminhamento: <span className="font-bold">{user.name}</span></p>
                
                <div className="w-1/2 border-t border-black pt-2">
                    <p className="font-bold">{user.name}</p>
                    <p className="text-xs">Professor(a) Regente</p>
                </div>
            </div>
        </div>
    </div>
  );
};
