import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {getStudentCompletionStatus} from '../services/studentCompletionStatus';
import {StudentCompletionBadge} from '../components/StudentCompletionBadge';
const complete={name:'Ana',birthDate:'2015-03-21',grade:'4º ano',schoolName:'Escola Exemplo',shift:'Manhã',guardianName:'Maria',guardianPhone:'63999999999'};
it.each(Object.keys(complete))('missing %s makes basic registration red',key=>{
 const student={...complete,[key]:'  '};
 const status=getStudentCompletionStatus(student);
 expect(status.isComplete).toBe(false);expect(status.missingFields).toHaveLength(1);
 expect(status.missingFields[0].key).toBe(key);
 const html=renderToStaticMarkup(<StudentCompletionBadge student={student as any}/>);
 expect(html).toContain('text-red-800');expect(html).toContain(status.missingFields[0].label);
});
it('all essentials, no clinical/pedagogical information: complete and green',()=>{
 expect(getStudentCompletionStatus(complete)).toEqual({isComplete:true,missingFields:[]});
 const html=renderToStaticMarkup(<StudentCompletionBadge student={complete as any}/>);
 expect(html).toContain('text-emerald-800');expect(html).not.toContain('popover=');
});
it('accepts age, school id and guardian email as their respective alternatives',()=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age:10,schoolName:'',schoolId:'school',guardianPhone:'',guardianEmail:'maria@example.org'})).toEqual({isComplete:true,missingFields:[]});
});
it.each([undefined,' ',NaN,-1,'unknown'])('missing or invalid age %s is not a substitute for birth date',age=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age}).missingFields.map(f=>f.key)).toEqual(['birthDate']);
});
it('zero years is a recorded age; external school is accepted for an external student',()=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age:0,schoolName:'',isExternalStudent:true,externalSchoolName:'Outra escola'}).isComplete).toBe(true);
});
it('optional data never appears in the missing-fields list',()=>{
 expect(getStudentCompletionStatus({}).missingFields.map(f=>f.key)).toEqual(['name','birthDate','grade','schoolName','shift','guardianName','guardianPhone']);
});
