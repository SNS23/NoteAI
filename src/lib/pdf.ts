import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ActionItem, Project } from "../types";
import { format } from "date-fns";

export function exportActionItemsToPDF(items: ActionItem[], project: Project | undefined) {
  const doc = new jsPDF("l", "mm", "a4");
  const projectName = project?.name || "All Projects";
  const dateStr = format(new Date(), "yyyy-MM-dd HH:mm");

  doc.setFontSize(18);
  doc.text(`Action Items Tracker - ${projectName}`, 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Generated on: ${dateStr}`, 14, 28);

  const tableData = items.map(item => [
    item.workStream,
    item.owner,
    item.responsible,
    item.informed,
    item.dueDate,
    item.status,
    item.ticketRef,
    item.nextSteps
  ]);

  autoTable(doc, {
    startY: 35,
    head: [['Work Stream', 'Owner', 'Responsible', 'Informed', 'Due Date', 'Status', 'Ticket Ref', 'Next Steps']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 40 },
      7: { cellWidth: 50 }
    }
  });

  doc.save(`Action_Items_${projectName.replace(/\s+/g, '_')}_${format(new Date(), "yyyyMMdd")}.pdf`);
}
