import { google } from "googleapis";

// Interface para configuração do Google Sheets
interface GoogleSheetsConfig {
  privateKey: string;
  clientEmail: string;
  projectId: string;
  clientId: string;
  authUri: string;
  tokenUri: string;
  authProviderX509CertUrl: string;
  clientX509CertUrl: string;
}

// Interface para dados de linha da planilha
export interface SheetRow {
  [key: string]: string | number | boolean | null;
}

// Interface para resposta de leitura
export interface SheetReadResponse {
  values: string[][];
  headers?: string[];
  data?: SheetRow[];
}

// Interface para resposta de escrita
export interface SheetWriteResponse {
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

class GoogleSheetsClient {
  private auth: any;
  private sheets: any;
  private initialized: boolean = false;

  constructor() {
    // Inicialização será feita de forma lazy
  }

  private async initializeAuth() {
    try {
      // Configuração das credenciais a partir das variáveis de ambiente
      const config: GoogleSheetsConfig = {
        privateKey:
          process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
        clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || "",
        projectId: process.env.GOOGLE_SHEETS_PROJECT_ID || "",
        clientId: process.env.GOOGLE_SHEETS_CLIENT_ID || "",
        authUri: process.env.GOOGLE_SHEETS_AUTH_URI || "",
        tokenUri: process.env.GOOGLE_SHEETS_TOKEN_URI || "",
        authProviderX509CertUrl:
          process.env.GOOGLE_SHEETS_AUTH_PROVIDER_X509_CERT_URL || "",
        clientX509CertUrl: process.env.GOOGLE_SHEETS_CLIENT_X509_CERT_URL || "",
      };

      // Validação das credenciais
      if (!config.privateKey || !config.clientEmail) {
        throw new Error(
          "Google Sheets credentials are not properly configured"
        );
      }

      console.log("🔐 Initializing Google Sheets authentication...");
      console.log("📧 Service Account Email:", config.clientEmail);
      console.log("🔑 Private Key Length:", config.privateKey.length);

      // Criação da autenticação JWT
      this.auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive.readonly",
        ],
      });

      // Autorizar o cliente
      await this.auth.authorize();
      console.log("✅ Google Sheets authentication successful");

      // Inicialização do cliente Google Sheets
      this.sheets = google.sheets({ version: "v4", auth: this.auth });
      this.initialized = true;
    } catch (error) {
      console.error("❌ Error initializing Google Sheets client:", error);
      throw error;
    }
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initializeAuth();
    }
  }

  /**
   * Lê dados de uma planilha
   * @param spreadsheetId ID da planilha
   * @param range Range dos dados (ex: 'Sheet1!A1:Z100')
   * @param includeHeaders Se deve incluir a primeira linha como cabeçalhos
   */
  async readSheet(
    spreadsheetId: string,
    range: string,
    includeHeaders: boolean = true
  ): Promise<SheetReadResponse> {
    try {
      await this.ensureInitialized();
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];

      if (values.length === 0) {
        return { values: [], headers: [], data: [] };
      }

      let headers: string[] = [];
      let dataRows: string[][] = values;

      if (includeHeaders && values.length > 0) {
        headers = values[0];
        dataRows = values.slice(1);
      }

      // Converte os dados para objetos se houver cabeçalhos
      const data: SheetRow[] =
        includeHeaders && headers.length > 0
          ? dataRows.map((row) => {
              const rowData: SheetRow = {};
              headers.forEach((header, index) => {
                rowData[header] = row[index] || null;
              });
              return rowData;
            })
          : [];

      return {
        values,
        headers: includeHeaders ? headers : undefined,
        data: includeHeaders ? data : undefined,
      };
    } catch (error) {
      console.error("Error reading Google Sheet:", error);
      throw new Error(`Failed to read Google Sheet: ${error}`);
    }
  }

  /**
   * Escreve dados em uma planilha
   * @param spreadsheetId ID da planilha
   * @param range Range onde escrever (ex: 'Sheet1!A1')
   * @param values Array bidimensional com os valores
   * @param valueInputOption Como interpretar os valores ('RAW' ou 'USER_ENTERED')
   */
  async writeSheet(
    spreadsheetId: string,
    range: string,
    values: (string | number | boolean)[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
  ): Promise<SheetWriteResponse> {
    try {
      await this.ensureInitialized();
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption,
        resource: {
          values,
        },
      });

      return {
        updatedRows: response.data.updatedRows || 0,
        updatedColumns: response.data.updatedColumns || 0,
        updatedCells: response.data.updatedCells || 0,
      };
    } catch (error) {
      console.error("Error writing to Google Sheet:", error);
      throw new Error(`Failed to write to Google Sheet: ${error}`);
    }
  }

  /**
   * Adiciona dados ao final de uma planilha
   * @param spreadsheetId ID da planilha
   * @param range Range da planilha (ex: 'Sheet1!A:Z')
   * @param values Array bidimensional com os valores
   * @param valueInputOption Como interpretar os valores
   */
  async appendSheet(
    spreadsheetId: string,
    range: string,
    values: (string | number | boolean)[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
  ): Promise<SheetWriteResponse> {
    try {
      await this.ensureInitialized();
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        insertDataOption: "INSERT_ROWS",
        resource: {
          values,
        },
      });

      return {
        updatedRows: response.data.updates?.updatedRows || 0,
        updatedColumns: response.data.updates?.updatedColumns || 0,
        updatedCells: response.data.updates?.updatedCells || 0,
      };
    } catch (error) {
      console.error("Error appending to Google Sheet:", error);
      throw new Error(`Failed to append to Google Sheet: ${error}`);
    }
  }

  /**
   * Limpa dados de uma planilha
   * @param spreadsheetId ID da planilha
   * @param range Range para limpar
   */
  async clearSheet(spreadsheetId: string, range: string): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
    } catch (error) {
      console.error("Error clearing Google Sheet:", error);
      throw new Error(`Failed to clear Google Sheet: ${error}`);
    }
  }

  /**
   * Obtém informações sobre a planilha
   * @param spreadsheetId ID da planilha
   */
  async getSpreadsheetInfo(spreadsheetId: string) {
    try {
      await this.ensureInitialized();
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      return {
        title: response.data.properties?.title,
        sheets: response.data.sheets?.map((sheet: any) => ({
          title: sheet.properties?.title,
          sheetId: sheet.properties?.sheetId,
          gridProperties: sheet.properties?.gridProperties,
        })),
      };
    } catch (error) {
      console.error("Error getting spreadsheet info:", error);
      throw new Error(`Failed to get spreadsheet info: ${error}`);
    }
  }
}

// Instância singleton do cliente
let googleSheetsClient: GoogleSheetsClient | null = null;

export function getGoogleSheetsClient(): GoogleSheetsClient {
  if (!googleSheetsClient) {
    googleSheetsClient = new GoogleSheetsClient();
  }
  return googleSheetsClient;
}

// Funções de conveniência para uso direto
export async function readGoogleSheet(
  spreadsheetId: string,
  range: string,
  includeHeaders: boolean = true
): Promise<SheetReadResponse> {
  const client = getGoogleSheetsClient();
  return client.readSheet(spreadsheetId, range, includeHeaders);
}

export async function writeGoogleSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean)[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
): Promise<SheetWriteResponse> {
  const client = getGoogleSheetsClient();
  return client.writeSheet(spreadsheetId, range, values, valueInputOption);
}

export async function appendGoogleSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean)[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
): Promise<SheetWriteResponse> {
  const client = getGoogleSheetsClient();
  return client.appendSheet(spreadsheetId, range, values, valueInputOption);
}
