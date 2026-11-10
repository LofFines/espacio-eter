/*
 * DATOS DE PREVIEW (copia de la planilla «Éter – Grilla de horarios y cupos», 7/11/2026).
 * Solo se usan en modo preview (?preview=1 o sin API configurada). En producción, reservas.js
 * los pide al Apps Script (doGet ?accion=datos), que los lee de la planilla en vivo.
 * Sin datos personales. «fijas» = alumnas fijas (columna L); vacío = 0. cupo null = cupo amplio.
 */
window.ETER_PREVIEW_DATA = {
  clases: [
    { id: 'ETR-001', disciplina: 'Pole sport', profe: 'Verito', dia: 'lunes', inicio: '19:00', fin: '20:00', nivel: 'inicial', cupo: 8, fijas: 4, prueba: true },
    { id: 'ETR-002', disciplina: 'Funcional', profe: 'Ara', dia: 'lunes', inicio: '19:00', fin: '20:00', nivel: '', cupo: 12, fijas: 5, prueba: true },
    { id: 'ETR-003', disciplina: 'Bachata', profe: 'Profes Salsa/Bachata', dia: 'lunes', inicio: '20:00', fin: '21:00', nivel: '', cupo: 18, fijas: 6, prueba: true },
    { id: 'ETR-004', disciplina: 'Pole coreográfico', profe: 'Ara', dia: 'martes', inicio: '19:00', fin: '20:00', nivel: 'inicial/intermedio', cupo: 8, fijas: 5, prueba: true },
    { id: 'ETR-005', disciplina: 'Funcional', profe: 'Agus', dia: 'martes', inicio: '19:00', fin: '20:00', nivel: '', cupo: 12, fijas: 6, prueba: true },
    { id: 'ETR-006', disciplina: 'Pole sport', profe: 'Ara', dia: 'martes', inicio: '20:00', fin: '21:00', nivel: 'multi nivel', cupo: 8, fijas: 7, prueba: true },
    { id: 'ETR-007', disciplina: 'Acro adultos', profe: 'Lu', dia: 'martes', inicio: '20:00', fin: '21:30', nivel: 'multi nivel', cupo: 12, fijas: 7, prueba: true },
    { id: 'ETR-008', disciplina: 'Pole Masculino', profe: 'Ara', dia: 'martes', inicio: '21:00', fin: '22:00', nivel: 'inicial', cupo: 8, fijas: 2, prueba: true },
    { id: 'ETR-009', disciplina: 'Pole sport', profe: 'Verito', dia: 'miércoles', inicio: '19:00', fin: '20:00', nivel: 'inicial', cupo: 8, fijas: 2, prueba: true },
    { id: 'ETR-010', disciplina: 'Salsa', profe: 'Profes Salsa/Bachata', dia: 'miércoles', inicio: '20:00', fin: '21:00', nivel: '', cupo: 18, fijas: 12, prueba: true },
    { id: 'ETR-011', disciplina: 'Pole sport', profe: 'Ara', dia: 'jueves', inicio: '19:00', fin: '20:00', nivel: 'multi nivel', cupo: 8, fijas: 6, prueba: true },
    { id: 'ETR-012', disciplina: 'Funcional', profe: 'Agus', dia: 'jueves', inicio: '19:00', fin: '20:00', nivel: '', cupo: 12, fijas: 6, prueba: true },
    { id: 'ETR-013', disciplina: 'Flexibilidad', profe: 'Lu', dia: 'jueves', inicio: '20:00', fin: '21:00', nivel: 'multi nivel', cupo: 10, fijas: 5, prueba: true },
    { id: 'ETR-014', disciplina: 'Acro adultos', profe: 'Lu', dia: 'jueves', inicio: '21:00', fin: '22:30', nivel: 'multi nivel', cupo: 12, fijas: 5, prueba: true },
    { id: 'ETR-015', disciplina: 'Flexibilidad', profe: 'Ara', dia: 'viernes', inicio: '18:00', fin: '19:00', nivel: 'multi nivel', cupo: 12, fijas: 3, prueba: true },
    { id: 'ETR-016', disciplina: 'Pole sport', profe: 'Ara', dia: 'viernes', inicio: '19:00', fin: '20:00', nivel: 'multi nivel', cupo: 8, fijas: 5, prueba: true },
    { id: 'ETR-017', disciplina: 'Pole sport', profe: 'Sabri', dia: 'sábado', inicio: '10:30', fin: '11:30', nivel: 'inicial', cupo: 8, fijas: 3, prueba: true },
    { id: 'ETR-018', disciplina: 'Funcional', profe: 'Ara', dia: 'sábado', inicio: '10:30', fin: '11:30', nivel: '', cupo: 12, fijas: 4, prueba: true },
    { id: 'ETR-019', disciplina: 'Pole sport', profe: 'Ara', dia: 'sábado', inicio: '11:30', fin: '12:30', nivel: 'multi nivel', cupo: 8, fijas: 6, prueba: true },
    { id: 'ETR-020', disciplina: 'Acro infantil', profe: 'Lucila', dia: 'sábado', inicio: '11:30', fin: '12:30', nivel: '', cupo: 12, fijas: 4, prueba: true }
  ],
  precios: [
    { disciplina: 'Pole sport', plan: '1 vez por semana', precio: 45000 },
    { disciplina: 'Pole sport', plan: '2 veces por semana', precio: 56000 },
    { disciplina: 'Pole sport', plan: '3 veces por semana', precio: 67000 },
    { disciplina: 'Pole sport', plan: 'Clase suelta', precio: 20000 },
    { disciplina: 'Pole coreográfico', plan: '1 vez por semana', precio: 45000 },
    { disciplina: 'Pole coreográfico', plan: '2 veces por semana', precio: 56000 },
    { disciplina: 'Pole coreográfico', plan: '3 veces por semana', precio: 67000 },
    { disciplina: 'Pole coreográfico', plan: 'Clase suelta', precio: 20000 },
    { disciplina: 'Pole Masculino', plan: '1 vez por semana', precio: 45000 },
    { disciplina: 'Pole Masculino', plan: '2 veces por semana', precio: 56000 },
    { disciplina: 'Pole Masculino', plan: '3 veces por semana', precio: 67000 },
    { disciplina: 'Pole Masculino', plan: 'Clase suelta', precio: 20000 },
    { disciplina: 'Funcional', plan: '1 vez por semana', precio: 43000 },
    { disciplina: 'Funcional', plan: '2 veces por semana', precio: 52000 },
    { disciplina: 'Funcional', plan: '3 veces por semana', precio: 59000 },
    { disciplina: 'Bachata', plan: '1 vez por semana', precio: 34000 },
    { disciplina: 'Bachata', plan: 'Clase suelta', precio: 11000 },
    { disciplina: 'Salsa', plan: '1 vez por semana', precio: 34000 },
    { disciplina: 'Salsa', plan: 'Clase suelta', precio: 11000 },
    { disciplina: 'Acro adultos', plan: '1 vez por semana', precio: 45000 },
    { disciplina: 'Acro adultos', plan: '2 veces por semana', precio: 54000 },
    { disciplina: 'Acro infantil', plan: '1 vez por semana', precio: 45000 },
    { disciplina: 'Flexibilidad', plan: '1 vez por semana', precio: 43000 },
    { disciplina: 'Flexibilidad', plan: '2 veces por semana', precio: 52000 }
  ],
  combo: { disciplinas: 3, descuento: 10 },
  // Confirmadas simuladas por fecha (clave «ID|AAAA-MM-DD»), para ver el contador bajar en el preview.
  confirmadas: {}
};
