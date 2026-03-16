import jsPDF from 'jspdf';
import type { TrainingPlan, Athlete } from '../types';

export const generatePlanPDF = (plan: TrainingPlan, athlete?: Athlete): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 0;

  // Colors
  const blue = [29, 78, 216] as [number, number, number];
  const lightBlue = [239, 246, 255] as [number, number, number];
  const darkBlue = [30, 58, 138] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const dark = [30, 41, 59] as [number, number, number];
  const gray = [100, 116, 139] as [number, number, number];
  const lightGray = [241, 245, 249] as [number, number, number];
  const borderGray = [226, 232, 240] as [number, number, number];

  const checkNewPage = (neededHeight: number) => {
    if (y + neededHeight > pageH - 20) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  // ─── COVER PAGE ───────────────────────────────────────────────────────────
  // Blue header background
  doc.setFillColor(...blue);
  doc.rect(0, 0, pageW, 70, 'F');

  // Decorative circle
  doc.setFillColor(...darkBlue);
  doc.circle(pageW - 10, -10, 40, 'F');
  doc.setFillColor(21, 53, 150);
  doc.circle(pageW + 5, 60, 30, 'F');

  // Logo placeholder
  doc.setFillColor(...white);
  doc.roundedRect(margin, 10, 35, 35, 4, 4, 'F');
  doc.setTextColor(...blue);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('APD', margin + 5, 25);
  doc.text('SPORT', margin + 3.5, 33);

  // Title
  doc.setTextColor(...white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('APD SPORT', margin + 42, 25);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Pro Trainer Platform', margin + 42, 33);

  // Thin separator
  doc.setFillColor(...white);
  doc.setDrawColor(...white);
  doc.rect(margin + 42, 37, 60, 0.5, 'F');

  // Plan name block
  y = 75;
  doc.setFillColor(...lightBlue);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
  doc.setTextColor(...darkBlue);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const planNameLines = doc.splitTextToSize(plan.name, contentW - 10);
  doc.text(planNameLines, margin + 5, y + 10);
  y += 35;

  // Athlete info
  if (athlete) {
    doc.setFillColor(...white);
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentW, 28, 3, 3, 'FD');

    doc.setTextColor(...gray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('ATLETA', margin + 5, y + 8);

    doc.setTextColor(...dark);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(athlete.name, margin + 5, y + 17);

    doc.setTextColor(...gray);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const athleteInfo = [athlete.sport, athlete.email].filter(Boolean).join(' · ');
    doc.text(athleteInfo, margin + 5, y + 23);

    y += 33;
  }

  // Plan info grid
  const infoItems = [
    { label: 'Semanas', value: String(plan.weeks.length) },
    { label: 'Nivel', value: plan.level ? { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', elite: 'Élite' }[plan.level] || plan.level : 'Sin especificar' },
    { label: 'Días/Semana', value: plan.daysPerWeek ? `${plan.daysPerWeek} días` : 'Variable' },
    { label: 'Deporte', value: plan.sport || 'General' },
  ];

  const colW = (contentW - 9) / 4;
  infoItems.forEach((item, i) => {
    const x = margin + i * (colW + 3);
    doc.setFillColor(...lightGray);
    doc.roundedRect(x, y, colW, 22, 3, 3, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label.toUpperCase(), x + 4, y + 7);
    doc.setTextColor(...dark);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(String(item.value), x + 4, y + 16);
  });
  y += 27;

  // Description
  if (plan.description) {
    doc.setFillColor(...lightBlue);
    doc.roundedRect(margin, y, contentW, 0, 3, 3, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', margin, y + 8);
    y += 12;
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(plan.description, contentW);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 8;
  }

  if (plan.objective) {
    doc.setTextColor(...gray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('OBJETIVO', margin, y);
    y += 6;
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const objLines = doc.splitTextToSize(plan.objective, contentW);
    doc.text(objLines, margin, y);
    y += objLines.length * 5 + 8;
  }

  // ─── WEEKS & DAYS ─────────────────────────────────────────────────────────
  plan.weeks.forEach((week) => {
    doc.addPage();
    y = margin;

    // Week header
    doc.setFillColor(...blue);
    doc.roundedRect(margin, y, contentW, 14, 3, 3, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`SEMANA ${week.weekNumber}`, margin + 5, y + 9.5);
    if (week.notes) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(week.notes, pageW - margin - 5, y + 9.5, { align: 'right' });
    }
    y += 19;

    week.days.forEach((day) => {
      checkNewPage(50);

      // Day header
      doc.setFillColor(...lightBlue);
      doc.roundedRect(margin, y, contentW, 11, 2, 2, 'F');
      doc.setTextColor(...darkBlue);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const dayTitle = day.isRestDay ? `DÍA ${day.dayNumber}: DESCANSO / ${day.name}` : `DÍA ${day.dayNumber}: ${day.name.toUpperCase()}`;
      doc.text(dayTitle, margin + 4, y + 7.5);
      if (day.focus) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...gray);
        doc.text(day.focus, pageW - margin - 4, y + 7.5, { align: 'right' });
      }
      y += 14;

      if (day.isRestDay) {
        doc.setTextColor(...gray);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('Día de descanso y recuperación activa.', margin + 4, y + 5);
        y += 12;
        return;
      }

      if (day.exercises.length === 0) {
        doc.setTextColor(...gray);
        doc.setFontSize(9);
        doc.text('Sin ejercicios programados.', margin + 4, y + 5);
        y += 10;
        return;
      }

      // Exercise table header
      const cols = { order: 8, name: 60, sets: 16, reps: 24, weight: 24, rest: 20, notes: contentW - 8 - 60 - 16 - 24 - 24 - 20 };
      const headers = ['#', 'Ejercicio', 'Series', 'Reps', 'Peso', 'Descanso', 'Notas'];
      const colWidths = [cols.order, cols.name, cols.sets, cols.reps, cols.weight, cols.rest, cols.notes];
      let cx = margin;

      doc.setFillColor(...darkBlue);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setTextColor(...white);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => {
        doc.text(h, cx + 2, y + 5.5);
        cx += colWidths[i];
      });
      y += 8;

      day.exercises.forEach((we, ei) => {
        const rowH = Math.max(10, we.sets.length * 6 + 4);
        checkNewPage(rowH + 4);

        if (ei % 2 === 0) {
          doc.setFillColor(255, 255, 255);
        } else {
          doc.setFillColor(...lightGray);
        }
        doc.rect(margin, y, contentW, rowH, 'F');

        // Exercise border
        doc.setDrawColor(...borderGray);
        doc.setLineWidth(0.3);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);

        cx = margin;
        doc.setTextColor(...dark);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(String(we.order), cx + 2, y + 6.5);
        cx += colWidths[0];

        const exNameLines = doc.splitTextToSize(we.exercise.name, colWidths[1] - 4);
        doc.text(exNameLines, cx + 2, y + 6.5);
        cx += colWidths[1];

        doc.setFont('helvetica', 'normal');
        we.sets.forEach((set, si) => {
          const setY = y + 6.5 + si * 6;
          if (si > 0) doc.setFontSize(7.5);
          let tempCx = cx;
          doc.text(String(set.sets || '-'), tempCx + 2, setY); tempCx += colWidths[2];
          doc.text(set.reps || '-', tempCx + 2, setY); tempCx += colWidths[3];
          doc.text(set.weight || '-', tempCx + 2, setY); tempCx += colWidths[4];
          doc.text(set.rest || '-', tempCx + 2, setY); tempCx += colWidths[5];
          if (set.notes) doc.text(doc.splitTextToSize(set.notes, colWidths[6] - 4)[0], tempCx + 2, setY);
        });

        y += rowH;
      });

      if (day.notes) {
        y += 3;
        doc.setTextColor(...gray);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        const noteLines = doc.splitTextToSize(`📝 ${day.notes}`, contentW);
        doc.text(noteLines, margin, y);
        y += noteLines.length * 4 + 4;
      }

      y += 6;
    });
  });

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...lightGray);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setTextColor(...gray);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('APD SPORT · Pro Trainer Platform', margin, pageH - 4.5);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 4.5, { align: 'right' });
  }

  return doc;
};
