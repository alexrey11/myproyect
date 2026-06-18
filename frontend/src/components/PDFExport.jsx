import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download } from 'lucide-react';

export default function PDFExport({ elementId, filename = 'reporte.pdf', buttonText = 'Exportar PDF' }) {
    const exportPDF = async () => {
        const element = document.getElementById(elementId);
        if (!element) {
            alert('No se encontró el elemento a exportar');
            return;
        }

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(filename);
        } catch (err) {
            console.error('Error generando PDF:', err);
            alert('Error al generar el PDF');
        }
    };

    return (
        <button onClick={exportPDF} className="btn-primary">
            <Download size={18} /> {buttonText}
        </button>
    );
}