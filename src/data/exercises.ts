import type { Exercise } from '../types';

export const EXERCISES_DB: Exercise[] = [
  // PECHO
  { id: 'ex001', name: 'Press de Banca Plano', muscleGroup: 'Pecho', equipment: 'Barra', difficulty: 'medium', description: 'Ejercicio fundamental para el desarrollo del pecho' },
  { id: 'ex002', name: 'Press de Banca Inclinado', muscleGroup: 'Pecho', equipment: 'Barra', difficulty: 'medium', description: 'Enfatiza la parte superior del pecho' },
  { id: 'ex003', name: 'Press de Banca Declinado', muscleGroup: 'Pecho', equipment: 'Barra', difficulty: 'medium', description: 'Enfatiza la parte inferior del pecho' },
  { id: 'ex004', name: 'Press con Mancuernas Plano', muscleGroup: 'Pecho', equipment: 'Mancuernas', difficulty: 'medium', description: 'Mayor rango de movimiento que con barra' },
  { id: 'ex005', name: 'Press con Mancuernas Inclinado', muscleGroup: 'Pecho', equipment: 'Mancuernas', difficulty: 'medium' },
  { id: 'ex006', name: 'Aperturas con Mancuernas', muscleGroup: 'Pecho', equipment: 'Mancuernas', difficulty: 'easy', description: 'Aislamiento del pecho' },
  { id: 'ex007', name: 'Fondos en Paralelas (Pecho)', muscleGroup: 'Pecho', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex008', name: 'Flexiones de Pecho', muscleGroup: 'Pecho', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex009', name: 'Flexiones Diamante', muscleGroup: 'Pecho', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex010', name: 'Cable Crossover', muscleGroup: 'Pecho', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex011', name: 'Pec Deck / Mariposa', muscleGroup: 'Pecho', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex012', name: 'Press en Máquina (Pecho)', muscleGroup: 'Pecho', equipment: 'Máquina', difficulty: 'easy' },

  // ESPALDA
  { id: 'ex013', name: 'Dominadas', muscleGroup: 'Espalda', equipment: 'Sin Equipo', difficulty: 'hard', description: 'Rey de los ejercicios de tirón' },
  { id: 'ex014', name: 'Jalón al Pecho (Polea)', muscleGroup: 'Espalda', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex015', name: 'Remo con Barra', muscleGroup: 'Espalda', equipment: 'Barra', difficulty: 'medium' },
  { id: 'ex016', name: 'Remo con Mancuerna', muscleGroup: 'Espalda', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex017', name: 'Remo en Cable', muscleGroup: 'Espalda', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex018', name: 'Peso Muerto Convencional', muscleGroup: 'Espalda', equipment: 'Barra', difficulty: 'hard', description: 'Ejercicio compuesto rey para la cadena posterior' },
  { id: 'ex019', name: 'Peso Muerto Rumano', muscleGroup: 'Espalda', equipment: 'Barra', difficulty: 'medium' },
  { id: 'ex020', name: 'Pull-Over con Mancuerna', muscleGroup: 'Espalda', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex021', name: 'Remo en Máquina', muscleGroup: 'Espalda', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex022', name: 'Face Pull', muscleGroup: 'Espalda', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex023', name: 'Hiperextensiones', muscleGroup: 'Espalda', equipment: 'Máquina', difficulty: 'easy' },

  // HOMBROS
  { id: 'ex024', name: 'Press Militar con Barra', muscleGroup: 'Hombros', equipment: 'Barra', difficulty: 'medium' },
  { id: 'ex025', name: 'Press Arnold', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'medium' },
  { id: 'ex026', name: 'Press de Hombros con Mancuernas', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex027', name: 'Elevaciones Laterales', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'easy', description: 'Aislamiento del deltoides lateral' },
  { id: 'ex028', name: 'Elevaciones Frontales', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex029', name: 'Elevaciones Posteriores (Pájaros)', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex030', name: 'Encogimientos de Hombros', muscleGroup: 'Hombros', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex031', name: 'Press en Máquina (Hombros)', muscleGroup: 'Hombros', equipment: 'Máquina', difficulty: 'easy' },

  // BÍCEPS
  { id: 'ex032', name: 'Curl con Barra', muscleGroup: 'Bíceps', equipment: 'Barra', difficulty: 'easy' },
  { id: 'ex033', name: 'Curl con Mancuernas', muscleGroup: 'Bíceps', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex034', name: 'Curl Martillo', muscleGroup: 'Bíceps', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex035', name: 'Curl en Cable', muscleGroup: 'Bíceps', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex036', name: 'Curl Concentrado', muscleGroup: 'Bíceps', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex037', name: 'Curl en Banco Scott', muscleGroup: 'Bíceps', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex038', name: 'Curl Inclinado', muscleGroup: 'Bíceps', equipment: 'Mancuernas', difficulty: 'easy' },

  // TRÍCEPS
  { id: 'ex039', name: 'Press Francés', muscleGroup: 'Tríceps', equipment: 'Barra', difficulty: 'medium' },
  { id: 'ex040', name: 'Extensión de Tríceps en Polea', muscleGroup: 'Tríceps', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex041', name: 'Fondos en Banco', muscleGroup: 'Tríceps', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex042', name: 'Extensión sobre la Cabeza', muscleGroup: 'Tríceps', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex043', name: 'Patada de Tríceps', muscleGroup: 'Tríceps', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex044', name: 'Fondo en Paralelas (Tríceps)', muscleGroup: 'Tríceps', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex045', name: 'Extensión con Mancuerna Cabeza', muscleGroup: 'Tríceps', equipment: 'Mancuernas', difficulty: 'easy' },

  // CORE / ABDOMEN
  { id: 'ex046', name: 'Crunch Abdominal', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex047', name: 'Plancha', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'easy', description: 'Ejercicio isométrico de core' },
  { id: 'ex048', name: 'Plancha Lateral', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex049', name: 'Elevación de Piernas', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex050', name: 'Russian Twist', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex051', name: 'Rueda Abdominal', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'hard' },
  { id: 'ex052', name: 'Mountain Climbers', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex053', name: 'Crunch en Cable', muscleGroup: 'Core / Abdomen', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex054', name: 'Hollow Body', muscleGroup: 'Core / Abdomen', equipment: 'Sin Equipo', difficulty: 'medium' },
  { id: 'ex055', name: 'Dragon Flag', muscleGroup: 'Core / Abdomen', equipment: 'Banco', difficulty: 'hard' },

  // CUÁDRICEPS
  { id: 'ex056', name: 'Sentadilla Trasera', muscleGroup: 'Cuádriceps', equipment: 'Barra', difficulty: 'hard', description: 'Rey de los ejercicios de pierna' },
  { id: 'ex057', name: 'Sentadilla Frontal', muscleGroup: 'Cuádriceps', equipment: 'Barra', difficulty: 'hard' },
  { id: 'ex058', name: 'Prensa de Pierna', muscleGroup: 'Cuádriceps', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex059', name: 'Extensión de Cuádriceps', muscleGroup: 'Cuádriceps', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex060', name: 'Zancadas / Lunges', muscleGroup: 'Cuádriceps', equipment: 'Mancuernas', difficulty: 'medium' },
  { id: 'ex061', name: 'Sentadilla Goblet', muscleGroup: 'Cuádriceps', equipment: 'Kettlebell', difficulty: 'easy' },
  { id: 'ex062', name: 'Sentadilla Búlgara', muscleGroup: 'Cuádriceps', equipment: 'Mancuernas', difficulty: 'hard' },
  { id: 'ex063', name: 'Paso al Cajón', muscleGroup: 'Cuádriceps', equipment: 'Caja / Plataforma', difficulty: 'easy' },
  { id: 'ex064', name: 'Sentadilla con Mancuernas', muscleGroup: 'Cuádriceps', equipment: 'Mancuernas', difficulty: 'easy' },

  // ISQUIOTIBIALES
  { id: 'ex065', name: 'Curl de Pierna Tumbado', muscleGroup: 'Isquiotibiales', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex066', name: 'Curl de Pierna Sentado', muscleGroup: 'Isquiotibiales', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex067', name: 'Buenos Días', muscleGroup: 'Isquiotibiales', equipment: 'Barra', difficulty: 'medium' },
  { id: 'ex068', name: 'Curl Nórdico', muscleGroup: 'Isquiotibiales', equipment: 'Sin Equipo', difficulty: 'hard' },
  { id: 'ex069', name: 'Peso Muerto a una Pierna', muscleGroup: 'Isquiotibiales', equipment: 'Mancuernas', difficulty: 'medium' },

  // GLÚTEOS
  { id: 'ex070', name: 'Hip Thrust con Barra', muscleGroup: 'Glúteos', equipment: 'Barra', difficulty: 'medium', description: 'Mejor ejercicio para glúteos' },
  { id: 'ex071', name: 'Hip Thrust con Mancuerna', muscleGroup: 'Glúteos', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex072', name: 'Patada de Glúteo en Cable', muscleGroup: 'Glúteos', equipment: 'Cable', difficulty: 'easy' },
  { id: 'ex073', name: 'Abducción de Cadera', muscleGroup: 'Glúteos', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex074', name: 'Sentadilla Sumo', muscleGroup: 'Glúteos', equipment: 'Mancuernas', difficulty: 'easy' },
  { id: 'ex075', name: 'Peso Muerto Sumo', muscleGroup: 'Glúteos', equipment: 'Barra', difficulty: 'medium' },

  // PANTORRILLAS
  { id: 'ex076', name: 'Elevación de Talones de Pie', muscleGroup: 'Pantorrillas', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex077', name: 'Elevación de Talones Sentado', muscleGroup: 'Pantorrillas', equipment: 'Máquina', difficulty: 'easy' },
  { id: 'ex078', name: 'Prensa para Pantorrillas', muscleGroup: 'Pantorrillas', equipment: 'Máquina', difficulty: 'easy' },

  // CUERPO COMPLETO
  { id: 'ex079', name: 'Clean & Jerk', muscleGroup: 'Cuerpo Completo', equipment: 'Barra', difficulty: 'hard' },
  { id: 'ex080', name: 'Snatch', muscleGroup: 'Cuerpo Completo', equipment: 'Barra', difficulty: 'hard' },
  { id: 'ex081', name: 'Kettlebell Swing', muscleGroup: 'Cuerpo Completo', equipment: 'Kettlebell', difficulty: 'medium' },
  { id: 'ex082', name: 'Burpees', muscleGroup: 'Cuerpo Completo', equipment: 'Sin Equipo', difficulty: 'hard' },
  { id: 'ex083', name: 'Turkish Get-Up', muscleGroup: 'Cuerpo Completo', equipment: 'Kettlebell', difficulty: 'hard' },
  { id: 'ex084', name: 'Wall Ball', muscleGroup: 'Cuerpo Completo', equipment: 'Pelota Medicinal', difficulty: 'medium' },
  { id: 'ex085', name: 'Thruster', muscleGroup: 'Cuerpo Completo', equipment: 'Barra', difficulty: 'hard' },
  { id: 'ex086', name: 'Power Clean', muscleGroup: 'Cuerpo Completo', equipment: 'Barra', difficulty: 'hard' },

  // CARDIO
  { id: 'ex087', name: 'Carrera en Cinta', muscleGroup: 'Cardio', equipment: 'Cinta de Correr', difficulty: 'easy' },
  { id: 'ex088', name: 'Sprints', muscleGroup: 'Cardio', equipment: 'Sin Equipo', difficulty: 'hard' },
  { id: 'ex089', name: 'Salto a la Comba', muscleGroup: 'Cardio', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex090', name: 'Bicicleta Estática', muscleGroup: 'Cardio', equipment: 'Bicicleta', difficulty: 'easy' },
  { id: 'ex091', name: 'Remo Ergómetro', muscleGroup: 'Cardio', equipment: 'Remo / Ergómetro', difficulty: 'medium' },
  { id: 'ex092', name: 'Box Jumps', muscleGroup: 'Cardio', equipment: 'Caja / Plataforma', difficulty: 'medium' },
  { id: 'ex093', name: 'HIIT en Bicicleta', muscleGroup: 'Cardio', equipment: 'Bicicleta', difficulty: 'hard' },
  { id: 'ex094', name: 'Jumping Jacks', muscleGroup: 'Cardio', equipment: 'Sin Equipo', difficulty: 'easy' },

  // MOVILIDAD / FLEXIBILIDAD
  { id: 'ex095', name: 'Estiramiento de Cadera', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex096', name: 'Estiramiento de Isquiotibiales', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex097', name: 'Movilidad de Hombro (Rotaciones)', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex098', name: 'Foam Roller (Espalda)', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex099', name: 'Cat-Cow (Columna)', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
  { id: 'ex100', name: 'Hip 90/90', muscleGroup: 'Movilidad / Flexibilidad', equipment: 'Sin Equipo', difficulty: 'easy' },
];
