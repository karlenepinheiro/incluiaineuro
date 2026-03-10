import React from 'react';
import { ShieldCheck, FileText, Lock } from 'lucide-react';
import { LGPDConsent } from '../types';

interface Props {
  onAccept: () => void;
}

export const LGPDModal: React.FC<Props> = ({ onAccept }) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-fade-in-up">
        
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
           <div className="bg-brand-100 p-2 rounded-lg text-brand-600">
               <ShieldCheck size={24} />
           </div>
           <div>
               <h2 className="text-xl font-bold text-gray-900">Privacidade e Segurança (LGPD)</h2>
               <p className="text-sm text-gray-500">Sua conformidade jurídica é nossa prioridade.</p>
           </div>
        </div>

        <div className="p-8 overflow-y-auto text-sm text-gray-600 space-y-4 leading-relaxed">
            <p>
                Bem-vindo ao <strong>IncluiAI</strong>. Para garantir a segurança dos dados sensíveis dos alunos e a conformidade com a 
                <strong> Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>, precisamos que você aceite nossos termos.
            </p>
            
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Lock size={14}/> 1. Proteção de Dados</h3>
            <p>
                Todos os dados inseridos (nomes, laudos, diagnósticos) são criptografados de ponta a ponta. 
                Nós atuamos como <strong>Operadores</strong> e você (ou sua instituição) como <strong>Controlador</strong> dos dados.
            </p>

            <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={14}/> 2. Uso da Inteligência Artificial</h3>
            <p>
                Ao utilizar nossos recursos de IA, os dados são anonimizados antes do processamento. 
                Não utilizamos dados de alunos para treinar modelos públicos.
            </p>

            <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShieldCheck size={14}/> 3. Responsabilidade Técnica</h3>
            <p>
                Os documentos gerados (PEI, PAEE, PDI) são sugestões técnicas baseadas nos dados fornecidos. 
                A validação final e assinatura é de responsabilidade do profissional de educação.
            </p>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-800 text-xs">
                <strong>Auditoria:</strong> Ao clicar em "Aceitar", registraremos seu IP, Data e Hora para fins de auditoria jurídica.
            </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500">
                Ao continuar, você concorda com os <a href="#" className="text-brand-600 underline">Termos de Uso</a> e <a href="#" className="text-brand-600 underline">Política de Privacidade</a>.
            </p>
            <button 
                onClick={onAccept}
                className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-700 transition shadow-lg hover:shadow-brand-200 w-full sm:w-auto"
            >
                Li e Aceito os Termos
            </button>
        </div>
      </div>
    </div>
  );
};
