import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Order, StockMovement } from '@/types';

export const exportFinanceReport = (orders: Order[], dateFrom: string, dateTo: string, deliveryPersonFilter?: string, companyName?: string) => {
  const doc = new jsPDF();
  
  // Format dates helper
  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR');
  };

  // Helper to format currency with dot separator
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('fr-FR').replace(/\s/g, '.');
  };

  const headerCompany = companyName || 'Entreprise';

  // Title
  doc.setFontSize(16);
  doc.text(headerCompany, 14, 16);
  doc.setFontSize(18);
  doc.text('Rapport Financier', 14, 28);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  let subTitle = `Période : du ${formatDate(dateFrom)} au ${formatDate(dateTo)}`;
  if (deliveryPersonFilter) {
    subTitle += ` | Livreur : ${deliveryPersonFilter}`;
  }
  doc.text(subTitle, 14, 36);

  // Calculate totals
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((acc, curr) => acc + curr.totalAmount, 0);
    
  const realizedRevenue = orders
    .filter(o => o.status === 'delivered' || o.status === 'paid')
    .reduce((acc, curr) => acc + curr.totalAmount, 0);

  // Calculate payment method totals (only for delivered or paid orders)
  const paymentTotals = orders
    .filter(o => o.status === 'delivered' || o.status === 'paid')
    .reduce((acc, curr) => {
      const method = curr.paymentMethod || 'Autre';
      acc[method] = (acc[method] || 0) + curr.totalAmount;
      return acc;
    }, {} as Record<string, number>);

  // Calculate delivery fees (4000 MGA per delivered/paid order)
  const deliveredOrdersCount = orders.filter(o => o.status === 'delivered' || o.status === 'paid').length;
  const totalDeliveryFees = deliveredOrdersCount * 4000;

  // Calculate total products sold (delivered/paid)
  const totalProductsSold = orders
    .filter(o => o.status === 'delivered' || o.status === 'paid')
    .reduce((acc, curr) => {
      const itemsCount = (curr.items || []).reduce((sum, item) => sum + item.quantity, 0);
      return acc + itemsCount;
    }, 0);

  // Summary section
  doc.setFontSize(10);
  doc.setTextColor(0);
  let y = 46;
  
  if (deliveryPersonFilter) {
    doc.text(`Livreur: ${deliveryPersonFilter}`, 14, y);
    y += 6;
  }

  doc.text(`Recettes Prévues (hors annulées): ${formatCurrency(totalRevenue)} MGA`, 14, y);
  y += 6;
  doc.text(`Recettes Réalisées (livrées/payées): ${formatCurrency(realizedRevenue)} MGA`, 14, y);
  y += 10;

  // Detailed breakdown
  doc.setFontSize(9);
  doc.text('Détail des paiements (Livrées/Payées) :', 14, y);
  y += 6;
  
  const methods = [
    { key: 'mvola', label: 'MVola' },
    { key: 'orange_money', label: 'Orange Money' },
    { key: 'airtel_money', label: 'Airtel Money' },
    { key: 'espece', label: 'Espèce' }
  ];

  methods.forEach(m => {
    const amount = paymentTotals[m.key] || 0;
    doc.text(`- ${m.label}: ${formatCurrency(amount)} MGA`, 20, y);
    y += 5;
  });

  // Other payments
  const otherAmount = Object.entries(paymentTotals)
    .filter(([key]) => !methods.map(m => m.key).includes(key))
    .reduce((sum, [, val]) => sum + val, 0);
  
  if (otherAmount > 0) {
    doc.text(`- Autre/Non spécifié: ${formatCurrency(otherAmount)} MGA`, 20, y);
    y += 5;
  }

  y += 5;
  doc.text(`Frais de livraison (4 000 Ar × ${deliveredOrdersCount}): ${formatCurrency(totalDeliveryFees)} MGA`, 14, y);
  y += 6;
  doc.text(`Nombre total de produits vendus: ${totalProductsSold}`, 14, y);

  // Prepare table data
  const tableData = orders.map(order => {
    const statusLabel = 
      order.status === 'delivered' ? 'Livrée' : 
      order.status === 'cancelled' ? 'Annulée' :
      order.status === 'paid' ? 'Payée' :
      order.status === 'shipping' ? 'En cours de livraison' :
      order.status === 'pending' ? 'En attente' : 
      order.status === 'confirmed' ? 'Confirmée' : order.status;

    const itemsSummary = (order.items || [])
      .map(i => `${i.productName} (${i.quantity})`)
      .join(', ');

    return [
      order.orderNumber || order.id.slice(0, 8),
      order.clientName,
      order.clientPhone || '-',
      formatDate(order.deliveryDate),
      order.shippingAddress || '-',
      itemsSummary,
      statusLabel,
      `${formatCurrency(order.totalAmount)} MGA`
    ];
  });

  // Generate table
  autoTable(doc, {
    startY: y + 10,
    head: [['N° Commande', 'Client', 'Contact', 'Date Livraison', 'Adresse Livraison', 'Articles', 'Statut', 'Montant']],
    body: tableData,
    theme: 'grid',
    styles: { 
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: { 
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 26 },
      2: { cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { cellWidth: 26 },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 16 },
      7: { cellWidth: 24, halign: 'right' }
    },
    didDrawPage: () => {
      // Add footer with page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `Page ${pageCount}`, 
        doc.internal.pageSize.width - 20, 
        doc.internal.pageSize.height - 10
      );
    }
  });

  // Save the PDF
  doc.save(`transactions_${dateFrom}_${dateTo}.pdf`);
};

export const exportStockMovementsReport = (
  inMovements: StockMovement[],
  outMovements: StockMovement[],
  dateFrom: string,
  dateTo: string,
  totalStock: number,
  topBranchLabel: string,
  companyName?: string
) => {
  const doc = new jsPDF();

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR');
  };

  const headerCompany = companyName || 'Entreprise';
  doc.setFontSize(16);
  doc.text(headerCompany, 14, 16);
  doc.setFontSize(18);
  doc.text('Rapport Mouvement Stock Vêtement', 14, 28);
  doc.setFontSize(11);
  doc.setTextColor(100);
  const subTitle = dateFrom || dateTo
    ? `Période : du ${formatDate(dateFrom || null)} au ${formatDate(dateTo || null)}`
    : 'Période : Toutes dates';
  doc.text(subTitle, 14, 36);

  doc.setFontSize(10);
  doc.setTextColor(0);
  let y = 46;
  doc.text(`Stock actuel (total): ${totalStock}`, 14, y);
  y += 6;
  doc.text(`Boutique la plus demandeuse: ${topBranchLabel}`, 14, y);
  y += 8;

  const inTable = inMovements.map((m) => [
    formatDate(m.createdAt),
    m.productName,
    m.size || '-',
    m.reason || '-',
    String(m.quantity),
    m.createdBy || '-',
  ]);

  autoTable(doc, {
    startY: y + 6,
    head: [['Date', 'Produit', 'Taille', 'Motif', 'Quantité', 'Créé par']],
    body: inTable,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [46, 125, 111], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' } },
  });

  const afterIn = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 20;
  const outTable = outMovements.map((m) => [
    formatDate(m.createdAt),
    m.productName,
    m.size || '-',
    m.reason || '-',
    String(m.quantity),
    m.createdBy || '-',
  ]);

  autoTable(doc, {
    startY: afterIn + 8,
    head: [['Date', 'Produit', 'Taille', 'Motif', 'Quantité', 'Créé par']],
    body: outTable,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' } },
  });

  const fileLabel = dateFrom || dateTo ? `_${dateFrom || 'all'}_${dateTo || 'all'}` : '';
  doc.save(`mouvements_stock${fileLabel}.pdf`);
};
