"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { QrScanner } from "@/components/QrScanner";
import { UserSquare, FileText, Copy, Check } from "lucide-react";

// === INTERFACES ===
interface DecodedQrData {
  header: {
    magicConstant: number;
    version: number;
    country: string;
    signerAndCertRef: string;
    issueDate: string;
    signDate: string;
    docType: number;
    docCategory: number;
  };
  documentInfo: {
    type: 'simple' | 'completo' | 'edad' | 'desconocido';
    typeName: string;
    description: string;
  };
  payload: {
    documentNumber?: string;
    name?: string;
    surnames?: string;
    dateOfBirth?: string;
    sex?: string;
    expiryDate?: string;
    nationality?: string;
    birthPlace?: string;
    address?: string;
    parentsNames?: string;
    isAdult?: boolean;
    image?: {
      size: number;
      format: string;
      dataUrl?: string;
    };
    dataExpiryDateTime?: string;
    // Campos adicionales para domicilio (DNI completo)
    addressLine1?: string;
    addressLine2?: string;
    addressLine3?: string;
    // Campos adicionales para lugar de nacimiento (DNI completo)
    birthPlaceLine2?: string;
    birthPlaceLine3?: string;
  };
  signature?: {
    length: number;
    data: string;
  };
}

// === UTILIDADES DE DECODIFICACIÓN ===

// Decodificación C40 según ICAO 9303-13
const decodeC40 = (bytes: Uint8Array): string => {
  if (!bytes || bytes.length === 0) return '';
  
  // Tabla C40 según ICAO 9303-13
  const C40_TABLE = [
    0, 1, 2, ' ', '0', '1', '2', '3', '4', '5', // 0-9
    '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', // 10-19
    'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', // 20-29
    'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'  // 30-39
  ];
  
  let result = '';
  let i = 0;
  
  while (i < bytes.length) {
    if (i + 1 >= bytes.length) break;
    
    const word = (bytes[i] << 8) | bytes[i + 1];
    i += 2;
    
    if (word === 0xFE00) break; // Padding
    
    const value = word - 1;
    const c1 = Math.floor(value / 1600);
    const c2 = Math.floor((value % 1600) / 40);
    const c3 = value % 40;
    
    if (c1 < C40_TABLE.length && typeof C40_TABLE[c1] === 'string') {
      result += C40_TABLE[c1];
    }
    if (c2 < C40_TABLE.length && typeof C40_TABLE[c2] === 'string') {
      result += C40_TABLE[c2];
    }
    if (c3 < C40_TABLE.length && typeof C40_TABLE[c3] === 'string') {
      result += C40_TABLE[c3];
    }
  }
  
  return result.replace(/</g, ' ').trim();
};

// Decodificación de fechas del header miDNI
const decodeMiDNIHeaderDate = (bytes: Uint8Array): string => {
  if (!bytes || bytes.length !== 3) {
    return `[${bytes ? Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'null'}]`;
  }
  
  console.log('Decodificando fecha:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  const value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
  console.log('Valor fecha como entero:', value, '(0x' + value.toString(16) + ')');
  
  // Método 1: Época 1900 (común en sistemas legacy)
  try {
    const baseDate = new Date(1900, 0, 1);
    const date = new Date(baseDate.getTime() + value * 24 * 60 * 60 * 1000);
    
    if (date.getFullYear() >= 1950 && date.getFullYear() <= 2030) {
      const result = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      console.log('Método 1 exitoso (época 1900):', result);
      return result;
    }
  } catch (e) {
    console.log('Método 1 falló:', e);
  }
  
  // Método 2: Época Unix (1 enero 1970)
  try {
    const baseDate = new Date(1970, 0, 1);
    const date = new Date(baseDate.getTime() + value * 24 * 60 * 60 * 1000);
    
    if (date.getFullYear() >= 1990 && date.getFullYear() <= 2030) {
      const result = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      console.log('Método 2 exitoso (época Unix):', result);
      return result;
    }
  } catch (e) {
    console.log('Método 2 falló:', e);
  }
  
  // Método 3: Fecha BCD (Binary Coded Decimal)
  try {
    const year = 2000 + ((bytes[0] >> 4) * 10 + (bytes[0] & 0x0F));
    const month = (bytes[1] >> 4) * 10 + (bytes[1] & 0x0F);
    const day = (bytes[2] >> 4) * 10 + (bytes[2] & 0x0F);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && 
        year >= 2000 && year <= 2050) {
      const result = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
      console.log('Método 3 exitoso (BCD):', result);
      return result;
    }
  } catch (e) {
    console.log('Método 3 falló:', e);
  }
  
  // Método 4: Formato ICAO MMDDYYYY
  try {
    const dateStr = value.toString().padStart(8, '0');
    if (dateStr.length >= 8) {
      const month = parseInt(dateStr.substr(0, 2), 10);
      const day = parseInt(dateStr.substr(2, 2), 10);
      const year = parseInt(dateStr.substr(4, 4), 10);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && 
          year >= 1950 && year <= 2030) {
        const result = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
        console.log('Método 4 exitoso (ICAO):', result);
        return result;
      }
    }
  } catch (e) {
    console.log('Método 4 falló:', e);
  }
  
  // Método 5: Época 2000
  try {
    const baseDate = new Date(2000, 0, 1);
    const date = new Date(baseDate.getTime() + value * 24 * 60 * 60 * 1000);
    
    if (date.getFullYear() >= 2000 && date.getFullYear() <= 2040) {
      const result = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      console.log('Método 5 exitoso (época 2000):', result);
      return result;
    }
  } catch (e) {
    console.log('Método 5 falló:', e);
  }
  
  // Si todos los métodos fallan, mostrar bytes sin procesar
  const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('Todos los métodos de fecha fallaron para:', hexStr);
  return `[${hexStr}]`;
};

// Decodificación de texto mejorada para payload miDNI
const decodeText = (bytes: Uint8Array): string => {
  if (!bytes || bytes.length === 0) return '';
  
  console.log('Decodificando texto:', Array.from(bytes.slice(0, Math.min(20, bytes.length)))
    .map(b => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > 20 ? '...' : ''));
  
  // Método 1: UTF-8 estándar (más común)
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const result = decoder.decode(bytes);
    if (result && result.trim() && !result.includes('\uFFFD')) {
      console.log('UTF-8 exitoso:', result);
      return result.trim();
    }
  } catch (e) {
    console.log('UTF-8 falló:', e);
  }
  
  // Método 2: Decodificación manual UTF-8 con validación estricta
  try {
    let result = '';
    let i = 0;
    while (i < bytes.length) {
      const byte = bytes[i];
      
      if (byte < 0x80) {
        // ASCII básico (0-127)
        result += String.fromCharCode(byte);
        i++;
      } else if ((byte & 0xE0) === 0xC0 && i + 1 < bytes.length) {
        // UTF-8 2 bytes: 110xxxxx 10xxxxxx
        const byte2 = bytes[i + 1];
        if ((byte2 & 0xC0) === 0x80) {
          const codePoint = ((byte & 0x1F) << 6) | (byte2 & 0x3F);
          // Validar que es un carácter válido
          if (codePoint >= 0x80 && codePoint <= 0x7FF) {
            result += String.fromCharCode(codePoint);
            i += 2;
            continue;
          }
        }
        // Si no es UTF-8 válido, tratar como byte individual
        result += String.fromCharCode(byte);
        i++;
      } else if ((byte & 0xF0) === 0xE0 && i + 2 < bytes.length) {
        // UTF-8 3 bytes: 1110xxxx 10xxxxxx 10xxxxxx
        const byte2 = bytes[i + 1];
        const byte3 = bytes[i + 2];
        if ((byte2 & 0xC0) === 0x80 && (byte3 & 0xC0) === 0x80) {
          const codePoint = ((byte & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
          if (codePoint >= 0x800 && codePoint <= 0xFFFF) {
            result += String.fromCharCode(codePoint);
            i += 3;
            continue;
          }
        }
        // Si no es UTF-8 válido, tratar como byte individual
        result += String.fromCharCode(byte);
        i++;
      } else {
        // Byte individual - tratar como ISO-8859-1
        result += String.fromCharCode(byte);
        i++;
      }
    }
    
    if (result && result.trim()) {
      console.log('UTF-8 manual exitoso:', result);
      return result.trim();
    }
  } catch (e) {
    console.log('UTF-8 manual falló:', e);
  }
  
  // Método 3: ISO-8859-1 (Latin-1) - bueno para caracteres españoles legacy
  try {
    const decoder = new TextDecoder('iso-8859-1');
    const result = decoder.decode(bytes);
    if (result && result.trim()) {
      console.log('ISO-8859-1 exitoso:', result);
      return result.trim();
    }
  } catch (e) {
    console.log('ISO-8859-1 falló:', e);
  }
  
  // Método 4: ASCII extendido como último recurso
  try {
    const result = Array.from(bytes)
      .map(b => {
        // ASCII imprimible
        if (b >= 32 && b <= 126) return String.fromCharCode(b);
        // Caracteres extendidos comunes
        if (b >= 160 && b <= 255) return String.fromCharCode(b);
        // Caracteres de control que podrían ser útiles
        if (b === 0x09 || b === 0x0A || b === 0x0D) return String.fromCharCode(b);
        // Todo lo demás como '?'
        return '?';
      })
      .join('')
      .trim();
    
    if (result && result !== '?'.repeat(result.length)) {
      console.log('ASCII extendido exitoso:', result);
      return result;
    }
  } catch (e) {
    console.log('ASCII extendido falló:', e);
  }
  
  // Si todo falla, mostrar como hex
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('Todos los métodos de texto fallaron, mostrando hex:', hex);
  return `[${hex}]`;
};

// Parseo de longitud DER-TLV mejorado
const parseDERLength = (data: Uint8Array, offset: number): { length: number; newOffset: number } => {
  if (offset >= data.length) {
    throw new Error(`Offset ${offset} fuera de rango (tamaño datos: ${data.length})`);
  }
  
  const firstByte = data[offset];
  console.log(`Parseando longitud DER en offset ${offset}: 0x${firstByte.toString(16)}`);
  
  // Forma corta: longitud < 128
  if (firstByte < 0x80) {
    console.log(`Longitud forma corta: ${firstByte}`);
    return { length: firstByte, newOffset: offset + 1 };
  } 
  
  // Forma larga: bit más significativo = 1
  const numLengthBytes = firstByte & 0x7F;
  console.log(`Longitud forma larga: ${numLengthBytes} bytes adicionales`);
  
  // Validaciones
  if (numLengthBytes === 0) {
    throw new Error('Longitud DER indefinida no permitida');
  }
  
  if (numLengthBytes > 4) {
    throw new Error(`Demasiados bytes de longitud: ${numLengthBytes}`);
  }
  
  if (offset + numLengthBytes >= data.length) {
    throw new Error(`No hay suficientes bytes para longitud: necesita ${numLengthBytes}, disponibles ${data.length - offset - 1}`);
  }
  
  // Leer los bytes de longitud
  let length = 0;
  for (let i = 1; i <= numLengthBytes; i++) {
    length = (length << 8) | data[offset + i];
  }
  
  console.log(`Longitud calculada: ${length}`);
  
  // Validación de longitud excesiva
  if (length > data.length) {
    throw new Error(`Longitud ${length} excede tamaño de datos ${data.length}`);
  }
  
  return { length, newOffset: offset + numLengthBytes + 1 };
};

// === FUNCIÓN PRINCIPAL DE DECODIFICACIÓN ===
const decodeMiDNI = (data: Uint8Array): DecodedQrData | null => {
  try {
    console.log('=== INICIANDO DECODIFICACIÓN miDNI ===');
    console.log('Datos:', data.length, 'bytes');
    
    if (!data || data.length < 12) {
      throw new Error('Datos insuficientes');
    }
    
    // Verificar magic constant
    if (data[0] !== 0xDC) {
      throw new Error('No es un QR miDNI válido');
    }
    
    let offset = 0;
    
    // === HEADER ===
    const magicConstant = data[offset++];
    const version = data[offset++];
    
    // País (2 bytes C40)
    const countryBytes = data.slice(offset, offset + 2);
    const country = decodeC40(countryBytes);
    offset += 2;
    
    // Firmante y certificado (variable en versión 4)
    let signerAndCertRef = '';
    let signerFieldSize = 0;
    
    if (version === 0x03) { // Versión 4
      console.log('Procesando header versión 4 con campo variable...');
      
      // Leer los primeros 4 bytes para obtener firmante
      if (offset + 4 > data.length) {
        throw new Error('Datos insuficientes para firmante');
      }
      
      const signerBytes = data.slice(offset, offset + 4);
      const signerDecoded = decodeC40(signerBytes);
      console.log('Firmante decodificado:', signerDecoded);
      
      // Extraer tamaño del certificado (últimos 2 caracteres del firmante)
      if (signerDecoded.length < 6) {
        throw new Error(`Firmante demasiado corto: "${signerDecoded}" (${signerDecoded.length} chars)`);
      }
      
      const sizeHex = signerDecoded.slice(-2);
      const certSize = parseInt(sizeHex, 16);
      console.log('Tamaño certificado:', certSize, 'bytes (0x' + sizeHex + ')');
      
      if (certSize > 0 && certSize <= 64) {
        // Calcular bytes C40 necesarios: ((certSize + padding) / 3) * 2, redondeado hacia arriba
        const c40Bytes = Math.ceil(certSize / 3) * 2;
        console.log('Bytes C40 necesarios para certificado:', c40Bytes);
        
        if (offset + 4 + c40Bytes <= data.length) {
          const certBytes = data.slice(offset + 4, offset + 4 + c40Bytes);
          const certDecoded = decodeC40(certBytes);
          const certRef = certDecoded.substring(0, certSize);
          
          console.log('Certificado decodificado:', certRef);
          
          // Construir referencia completa: País + Entidad + Certificado
          const country = signerDecoded.substring(0, 2);
          const entity = signerDecoded.substring(2, 4);
          signerAndCertRef = country + entity + certRef;
          
          signerFieldSize = 4 + c40Bytes;
        } else {
          console.warn('No hay suficientes bytes para el certificado');
          signerAndCertRef = signerDecoded;
          signerFieldSize = 4;
        }
      } else {
        console.warn('Tamaño de certificado inválido:', certSize);
        signerAndCertRef = signerDecoded;
        signerFieldSize = 4;
      }
      
      offset += signerFieldSize;
    } else {
      // Versión 3: 6 bytes fijos
      const signerBytes = data.slice(offset, offset + 6);
      signerAndCertRef = decodeC40(signerBytes);
      signerFieldSize = 6;
      offset += 6;
    }
    
    console.log('Firmante y certificado final:', signerAndCertRef);
    console.log('Tamaño del campo firmante:', signerFieldSize, 'bytes');
    console.log('Offset después del firmante:', offset);
    
    // Fechas (3 bytes cada una)
    const issueDateBytes = data.slice(offset, offset + 3);
    const issueDate = decodeMiDNIHeaderDate(issueDateBytes);
    offset += 3;
    
    const signDateBytes = data.slice(offset, offset + 3);
    const signDate = decodeMiDNIHeaderDate(signDateBytes);
    offset += 3;
    
    // Tipo y categoría
    const docType = data[offset++];
    const docCategory = data[offset++];
    
    // Determinar tipo de documento según miDNI
    // docType = Referencia de definición de elementos (7=Simple, 8=Completo, 9=Edad)
    // docCategory = Categoría de tipo de documento (9=DNI en el móvil de España)
    let documentInfo: DecodedQrData['documentInfo'];
    switch (docType) {
      case 7:
        documentInfo = {
          type: 'simple',
          typeName: 'DNI Simple',
          description: 'Datos básicos del DNI'
        };
        break;
      case 8:
        documentInfo = {
          type: 'completo',
          typeName: 'DNI Completo',
          description: 'Datos completos con domicilio y filiación'
        };
        break;
      case 9:
        documentInfo = {
          type: 'edad',
          typeName: 'Verificación de Edad',
          description: 'Solo verificación de mayoría de edad'
        };
        break;
      case 64:
        documentInfo = {
          type: 'edad',
          typeName: 'Verificación de Edad (64)',
          description: 'Verificación de mayoría de edad - formato alternativo'
        };
        break;
      default:
        documentInfo = {
          type: 'desconocido',
          typeName: `Tipo ${docType}`,
          description: `Referencia de definición ${docType} - puede contener datos específicos`
        };
    }
    
    // Validar categoría de documento
    if (docCategory !== 9) {
      console.warn(`Categoría de documento inesperada: ${docCategory} (esperado: 9 para DNI español)`);
    }
    
    console.log('Header parseado:', {
      magicConstant: `0x${magicConstant.toString(16)}`,
      version,
      country,
      signerAndCertRef,
      issueDate,
      signDate,
      docType,
      docCategory,
      documentInfo
    });
    
    // === PAYLOAD ===
    const payload: DecodedQrData['payload'] = {};
    
    while (offset < data.length) {
      if (offset + 1 >= data.length) break;
      
      const tag = data[offset++];
      
      // Si encontramos la firma (0xFF), parar
      if (tag === 0xFF) {
        offset--; // Retroceder para procesar la firma
        break;
      }
      
      // Parsear longitud
      const lengthInfo = parseDERLength(data, offset);
      offset = lengthInfo.newOffset;
      
      if (offset + lengthInfo.length > data.length) {
        console.warn(`Tag 0x${tag.toString(16)}: longitud ${lengthInfo.length} excede datos disponibles`);
        break;
      }
      
      const value = data.slice(offset, offset + lengthInfo.length);
      offset += lengthInfo.length;
      
      console.log(`Procesando tag 0x${tag.toString(16)}: ${lengthInfo.length} bytes`);
      
      // Decodificar según el tag
      switch (tag) {
        case 0x40: // Número de documento
          payload.documentNumber = decodeText(value);
          break;
        case 0x42: // Fecha de nacimiento
          payload.dateOfBirth = decodeText(value); // Formato DD-MM-YYYY
          break;
        case 0x44: // Nombre
          payload.name = decodeText(value);
          break;
        case 0x46: // Apellidos
          payload.surnames = decodeText(value);
          break;
        case 0x48: // Sexo
          payload.sex = decodeText(value);
          break;
        case 0x4C: // Fecha de caducidad
          payload.expiryDate = decodeText(value);
          break;
        case 0x50: // Imagen en miniatura
          console.log(`Imagen encontrada: ${value.length} bytes`);
          
          // Detectar formato de imagen por header bytes
          let imageFormat = 'JPEG2000';
          let mimeType = 'image/jp2';
          
          if (value.length >= 4) {
            const header = Array.from(value.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('Header imagen:', header);
            
            // Detectar JPEG2000: usualmente empieza con 0x0000000c
            if (value.length >= 12) {
              const jp2Header = Array.from(value.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
              console.log('Header JPEG2000:', jp2Header);
              
              if (jp2Header.startsWith('0000000c6a502020')) {
                imageFormat = 'JPEG2000';
                mimeType = 'image/jp2';
              }
            }
            
            // Detectar JPEG: empieza con FFD8
            if (header.startsWith('ffd8')) {
              imageFormat = 'JPEG';
              mimeType = 'image/jpeg';
            }
            
            // Detectar PNG: empieza con 89504E47
            if (header.startsWith('89504e47')) {
              imageFormat = 'PNG';
              mimeType = 'image/png';
            }
          }
          
          payload.image = {
            size: value.length,
            format: imageFormat
          };
          
          // Solo intentar crear data URL si los datos parecen válidos
          if (value.length > 10) {
            try {
              const base64 = btoa(String.fromCharCode(...value));
              payload.image.dataUrl = `data:${mimeType};base64,${base64}`;
              console.log('Data URL creada para imagen');
            } catch (e) {
              console.warn('Error creando data URL para imagen:', e);
              payload.image.dataUrl = undefined;
            }
          } else {
            console.warn(`Imagen demasiado pequeña (${value.length} bytes), probablemente datos de prueba`);
          }
          break;
        case 0x60: // Dirección completa
          payload.address = decodeText(value);
          break;
        case 0x62: // Lugar de nacimiento
          payload.birthPlace = decodeText(value);
          break;
        case 0x64: // Nacionalidad
          payload.nationality = decodeText(value);
          break;
        case 0x66: // Nombres de padres
          payload.parentsNames = decodeText(value);
          break;
        case 0x70: // Es mayor de edad
          payload.isAdult = value.length > 0 && value[0] === 0x01;
          break;
        case 0x72: // Lugar de domicilio, línea 1 (DNI completo)
          if (!payload.address) payload.address = '';
          payload.address += decodeText(value);
          break;
        case 0x74: // Lugar de domicilio, línea 2 (DNI completo)
          if (!payload.address) payload.address = '';
          payload.address += ' ' + decodeText(value);
          break;
        case 0x76: // Lugar de domicilio, línea 3 (DNI completo)
          if (!payload.address) payload.address = '';
          payload.address += ' ' + decodeText(value);
          break;
        case 0x78: // Lugar de nacimiento, línea 2 (DNI completo)
          if (!payload.birthPlace) payload.birthPlace = '';
          payload.birthPlace += ' ' + decodeText(value);
          break;
        case 0x7A: // Lugar de nacimiento, línea 3 (DNI completo)
          if (!payload.birthPlace) payload.birthPlace = '';
          payload.birthPlace += ' ' + decodeText(value);
          break;
        case 0x80: // Fecha/hora caducidad datos
          payload.dataExpiryDateTime = decodeText(value);
          break;
        default:
          const hexValue = Array.from(value.slice(0, Math.min(8, value.length)))
            .map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`Tag 0x${tag.toString(16)} (${lengthInfo.length} bytes): ${hexValue}${value.length > 8 ? '...' : ''} - no definido en miDNI`);
      }
    }
    
    // === FIRMA ===
    let signature: DecodedQrData['signature'] | undefined;
    
    if (offset < data.length && data[offset] === 0xFF) {
      offset++; // Saltar tag de firma
      
      const sigLengthInfo = parseDERLength(data, offset);
      offset = sigLengthInfo.newOffset;
      
      if (offset + sigLengthInfo.length <= data.length) {
        const sigData = data.slice(offset, offset + sigLengthInfo.length);
        signature = {
          length: sigLengthInfo.length,
          data: Array.from(sigData).map(b => b.toString(16).padStart(2, '0')).join('')
        };
      }
    }
    
    console.log('=== DECODIFICACIÓN COMPLETADA ===');
    console.log('Payload:', payload);
    
    return {
      header: {
        magicConstant,
        version,
        country,
        signerAndCertRef,
        issueDate,
        signDate,
        docType,
        docCategory
      },
      documentInfo,
      payload,
      signature
    };
    
  } catch (error) {
    console.error('Error en decodificación:', error);
    return null;
  }
};

// === COMPONENTE PRINCIPAL ===
export default function Home() {
  const [scannedData, setScannedData] = useState<Uint8Array | null>(null);
  const [decodedData, setDecodedData] = useState<DecodedQrData | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [lastProcessedData, setLastProcessedData] = useState<string>('');
  const { toast } = useToast();

  const handleScan = (data: string) => {
    try {
      // Evitar procesar el mismo QR múltiples veces
      const dataHash = data.length + '-' + data.slice(0, 20);
      if (dataHash === lastProcessedData) {
        console.log('QR ya procesado, ignorando');
        return;
      }
      
      // Convertir QR data a bytes usando ISO-8859-1
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i) & 0xFF;
      }
      
      console.log('QR escaneado:', bytes.length, 'bytes');
      setScannedData(bytes);
      setLastProcessedData(dataHash);
      
      // Decodificar solo una vez
      const decoded = decodeMiDNI(bytes);
      setDecodedData(decoded);
      
      if (decoded) {
        toast({
          title: "QR Decodificado",
          description: `${decoded.documentInfo.typeName} procesado correctamente`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error de Decodificación",
          description: "No se pudo decodificar el QR",
        });
      }
    } catch (error) {
      console.error('Error procesando QR:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error procesando el código QR",
      });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast({
      title: "Copiado",
      description: "Texto copiado al portapapeles",
    });
  };

  const testWithMiDNIExample = () => {
    try {
      console.clear();
      console.log('=== EJECUTANDO TEST CON EJEMPLO miDNI ===');
      
      // Datos de test basados en el QR real mostrado por el usuario
      const testData = new Uint8Array([
        0xDC, 0x03, // Magic + Version 4
        0x75, 0x81, // País "ES" en C40
        
        // Firmante "ERXN20" + Certificado de 32 caracteres (como en el log real)
        0x75, 0x9E, 0xA9, 0xB5, // "ERXN20" en C40 (ER=país, XN=entidad, 20=tamaño cert en hex)
        0x26, 0x7C, 0x34, 0x11, 0x4B, 0xF9, 0x1B, 0x66, // Certificado parte 1
        0x2D, 0x5D, 0x78, 0x5A, 0x71, 0xF9, 0x4B, 0xB4, // Certificado parte 2  
        0x72, 0xEC, 0x71, 0xF9, 0x71, 0xC1, // Certificado parte 3
        
        // Fechas (basadas en los logs reales: 6b e9 19)
        0x6b, 0xe9, 0x19, // Fecha emisión  
        0x6b, 0xe9, 0x19, // Fecha firma
        
        0x07, 0x09, // Tipo 7 (Simple) + categoría 9 (DNI español)
        
        // Payload para DNI Simple como el mostrado
        0x40, 0x09, // DNI tag + longitud 9
        0x34, 0x34, 0x36, 0x38, 0x36, 0x30, 0x35, 0x35, 0x45, // "44686055E"
        
        0x42, 0x0A, // Fecha nacimiento tag + longitud 10
        0x32, 0x32, 0x2D, 0x30, 0x37, 0x2D, 0x31, 0x39, 0x37, 0x37, // "22-07-1977"
        
        0x44, 0x06, // Nombre tag + longitud 6
        0x49, 0xC3, 0x91, 0x41, 0x4B, 0x49, // "IÑAKI" (con Ñ en UTF-8)
        
        0x46, 0x19, // Apellidos tag + longitud 25
        0x44, 0x49, 0x41, 0x5A, 0x20, 0x4D, 0x41, 0x52, 0x54, 0x49, // "DIAZ MARTI"
        0x4E, 0x45, 0x5A, 0x20, 0x44, 0x45, 0x20, 0x4C, 0x41, 0x46, // "NEZ DE LAF"
        0x55, 0x45, 0x4E, 0x54, 0x45, // "UENTE"
        
        0x48, 0x01, 0x4D, // Sexo: M
        
        0x4C, 0x0A, // Fecha caducidad tag + longitud 10
        0x31, 0x38, 0x2D, 0x30, 0x35, 0x2D, 0x32, 0x30, 0x32, 0x38, // "18-05-2028"
        
        0x50, 0x1A, // Imagen tag + longitud 26 (datos de prueba)
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
        0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13,
        0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
        
        // Firma (tag 0xFF + longitud 32 + datos de prueba)
        0xFF, 0x20,
        0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
        0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
        0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00,
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
      ]);
      
      console.log('Test data length:', testData.length);
      setScannedData(testData);
      setLastProcessedData('test-' + testData.length);
      
      const decoded = decodeMiDNI(testData);
      setDecodedData(decoded);
      
      if (decoded) {
        console.log('Test completado exitosamente');
        toast({
          title: "Test Ejecutado",
          description: `${decoded.documentInfo.typeName} - datos de ejemplo procesados`,
        });
      } else {
        console.error('Test falló - no se pudo decodificar');
        toast({
          variant: "destructive",
          title: "Test Falló",
          description: "No se pudieron procesar los datos de ejemplo",
        });
      }
    } catch (error) {
      console.error('Error en test:', error);
      toast({
        variant: "destructive",
        title: "Error en Test",
        description: "Error ejecutando datos de ejemplo",
      });
    }
  };

  const byteArrayString = scannedData ? Array.from(scannedData).join(', ') : '';
  const byteArrayTable = scannedData ? 
    Array.from(scannedData)
      .map((byte, index) => {
        const hex = byte.toString(16).padStart(2, '0').toUpperCase();
        const ascii = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
        return `${index.toString(16).padStart(4, '0')}: ${hex} ${ascii}`;
      })
      .join('\n') : '';

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="text-4xl font-bold text-primary">ByteScan</div>
          </div>
          <p className="text-muted-foreground">
            Escaner de códigos QR miDNI y visualizador de datos decodificados
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <QrScanner onScan={handleScan} />
          
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Datos del DNI
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={testWithMiDNIExample}
                >
                  🧪 Test con Ejemplo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="decoded" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="decoded">DNI Decodificado</TabsTrigger>
                  <TabsTrigger value="raw">Datos Raw</TabsTrigger>
                </TabsList>
                
                <TabsContent value="decoded" className="space-y-4">
                  {decodedData ? (
                    <div className="space-y-6">
                      {/* Información del Documento */}
                      <div className="bg-muted/20 p-4 rounded-lg">
                        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          {decodedData.documentInfo.typeName}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {decodedData.documentInfo.description}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">País:</span>{" "}
                            <code className="bg-muted px-2 py-1 rounded">{decodedData.header.country}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Versión:</span>{" "}
                            <code className="bg-muted px-2 py-1 rounded">{decodedData.header.version}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Emisión:</span>{" "}
                            <code className="bg-muted px-2 py-1 rounded">{decodedData.header.issueDate}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Firma:</span>{" "}
                            <code className="bg-muted px-2 py-1 rounded">{decodedData.header.signDate}</code>
                          </div>
                        </div>
                      </div>
                      
                      {/* Datos Personales */}
                      <div className="bg-muted/20 p-4 rounded-lg">
                        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                          <UserSquare className="w-5 h-5" />
                          Datos Personales
                        </h3>
                        
                        <div className="grid gap-3">
                          {decodedData.payload.documentNumber && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Número de Documento:</span>
                              <code className="bg-muted px-2 py-1 rounded font-mono">
                                {decodedData.payload.documentNumber}
                              </code>
                            </div>
                          )}
                          
                          {decodedData.payload.name && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Nombre:</span>
                              <span className="font-medium">{decodedData.payload.name}</span>
                            </div>
                          )}
                          
                          {decodedData.payload.surnames && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Apellidos:</span>
                              <span className="font-medium">{decodedData.payload.surnames}</span>
                            </div>
                          )}
                          
                          {decodedData.payload.dateOfBirth && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Fecha de Nacimiento:</span>
                              <code className="bg-muted px-2 py-1 rounded">
                                {decodedData.payload.dateOfBirth}
                              </code>
                            </div>
                          )}
                          
                          {decodedData.payload.sex && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Sexo:</span>
                              <span className="font-medium">{decodedData.payload.sex}</span>
                            </div>
                          )}
                          
                          {decodedData.payload.nationality && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Nacionalidad:</span>
                              <span className="font-medium">{decodedData.payload.nationality}</span>
                            </div>
                          )}
                          
                          {decodedData.payload.expiryDate && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Fecha de Caducidad:</span>
                              <code className="bg-muted px-2 py-1 rounded">
                                {decodedData.payload.expiryDate}
                              </code>
                            </div>
                          )}
                          
                          {decodedData.payload.isAdult !== undefined && (
                            <div className="flex justify-between items-center py-2 border-b border-muted">
                              <span className="text-muted-foreground">Mayor de Edad:</span>
                              <span className={`font-medium ${decodedData.payload.isAdult ? 'text-green-600' : 'text-red-600'}`}>
                                {decodedData.payload.isAdult ? 'Sí' : 'No'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Información Adicional */}
                      {(decodedData.payload.address || decodedData.payload.birthPlace || decodedData.payload.parentsNames) && (
                        <div className="bg-muted/20 p-4 rounded-lg">
                          <h3 className="font-semibold text-lg mb-3">Información Adicional</h3>
                          
                          <div className="grid gap-3">
                            {decodedData.payload.address && (
                              <div>
                                <span className="text-sm text-muted-foreground">Domicilio:</span>
                                <div className="mt-1 p-2 bg-muted rounded">
                                  {decodedData.payload.address}
                                </div>
                              </div>
                            )}
                            
                            {decodedData.payload.birthPlace && (
                              <div>
                                <span className="text-sm text-muted-foreground">Lugar de Nacimiento:</span>
                                <div className="mt-1 p-2 bg-muted rounded">
                                  {decodedData.payload.birthPlace}
                                </div>
                              </div>
                            )}
                            
                            {decodedData.payload.parentsNames && (
                              <div>
                                <span className="text-sm text-muted-foreground">Filiación:</span>
                                <div className="mt-1 p-2 bg-muted rounded">
                                  {decodedData.payload.parentsNames}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Imagen */}
                      {decodedData.payload.image && (
                        <div className="bg-muted/20 p-4 rounded-lg">
                          <h3 className="font-semibold text-lg mb-3">Fotografía</h3>
                          
                          <div className="flex items-center gap-4">
                            <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center">
                              {decodedData.payload.image.dataUrl ? (
                                <img 
                                  src={decodedData.payload.image.dataUrl}
                                  alt="Foto DNI"
                                  className="w-full h-full object-cover rounded-lg"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <UserSquare className="w-12 h-12 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="text-sm space-y-1">
                              <div>
                                <span className="text-muted-foreground">Formato:</span>{" "}
                                {decodedData.payload.image.format}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Tamaño:</span>{" "}
                                {decodedData.payload.image.size} bytes
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Caducidad de Datos */}
                      {decodedData.payload.dataExpiryDateTime && (
                        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                          <h3 className="font-semibold text-lg mb-2 text-yellow-800">
                            ⏰ Caducidad de los Datos
                          </h3>
                          <p className="text-sm text-yellow-700">
                            Los datos de este QR caducan el: <strong>{decodedData.payload.dataExpiryDateTime}</strong>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Escanea un código QR miDNI para ver los datos decodificados</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="raw" className="relative">
                  <div className="space-y-4">
                    <div className="relative">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-2 right-2 z-10"
                        onClick={() => handleCopy(byteArrayString)} 
                        disabled={!byteArrayString || isCopied}
                      >
                        {isCopied ? <Check className="text-accent" /> : <Copy className="text-primary" />}
                      </Button>
                      <Textarea
                        readOnly
                        value={byteArrayString}
                        placeholder="Escanea un código QR para ver el array de bytes aquí..."
                        className="font-mono h-32 resize-none bg-muted/20 pr-10"
                      />
                    </div>
                    
                    {scannedData && scannedData.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium">Dump Hexadecimal</h3>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleCopy(byteArrayTable)}
                          >
                            <Copy className="w-3.5 h-3.5 mr-2" />
                            Copiar Dump
                          </Button>
                        </div>
                        <pre className="text-xs font-mono bg-muted/20 p-4 rounded-md overflow-x-auto">
                          {byteArrayTable}
                        </pre>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
    