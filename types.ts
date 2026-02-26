
export type InvoiceStatus = 'Pending' | 'Paid' | 'Processing' | 'Overdue' | 'Error';
export type DocumentType = 'Invoice' | 'Receipt' | 'Credit Note' | 'Proforma' | 'Other';

export interface InvoiceData {
  id: string;
  vendor: string;
  date: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  category: string;
  docType: DocumentType;
  status: InvoiceStatus;
  fileName: string;
  uploadDate: string;
  comment?: string;
  fileData?: string; // Base64 representation for viewing
  mimeType?: string;
}

export interface HistoryLog {
  id: string;
  type: 'Edit' | 'Delete';
  timestamp: number;
  description: string;
  previousState: InvoiceData;
  invoiceId: string;
}

export enum Category {
  Utility = 'Utility',
  Software = 'Software',
  Rent = 'Rent',
  Marketing = 'Marketing',
  Supplies = 'Supplies',
  Travel = 'Travel',
  Other = 'Other'
}

export interface AppSettings {
  isDarkMode: boolean;
  isAutoDarkModeEnabled: boolean;
  invoiceDeadlineDay: number; // Day of the month (1-31)
  isDeadlineNotificationEnabled: boolean;
  useDynamicVendorIcons: boolean;
}

export interface ExtractionResult {
  vendor: string;
  date: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  category: string;
  docType: DocumentType;
}