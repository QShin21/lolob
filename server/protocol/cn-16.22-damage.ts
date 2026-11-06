// Extracted from the read-only CN 16.22.836.1077 process image using rofl-parser (ISC).
// Packet 12, factory 0xCB46B0, deserializer 0xCF3790; exact replay totals validated.
function bitsLE(input: Uint8Array, bitOffset: number, bitLength: number): number {
  let value=0;for(let i=0;i<bitLength;i++)value|=((input[(bitOffset+i)>>>3]>>>((bitOffset+i)&7))&1)<<i;return value;
}
const LUT_0=[8,225,235,79,63,166,159,20,75,158,122,194,98,177,91,240,145,179,38,25,254,211,251,82,73,223,54,141,186,209,214,163,168,219,1,37,77,60,146,108,16,176,120,207,116,72,29,22,51,15,56,65,12,172,7,124,144,181,83,154,103,45,81,113,132,95,128,14,100,58,107,156,69,227,224,23,70,215,213,117,185,192,161,200,89,47,167,71,233,111,129,93,196,236,136,0,164,115,32,102,150,112,142,84,165,148,64,57,3,40,204,202,109,189,67,143,170,231,50,85,18,151,155,147,104,138,13,218,191,35,212,19,62,140,105,80,244,27,33,42,2,49,46,241,184,61,169,248,59,247,222,86,253,188,190,66,4,17,55,208,87,139,252,118,230,99,217,232,201,5,245,53,134,11,131,90,206,92,182,125,195,121,36,126,249,88,205,183,187,228,78,43,9,210,28,198,238,119,127,250,135,97,152,221,114,162,68,203,178,237,137,10,243,239,180,229,216,44,246,174,6,110,242,153,39,160,106,130,255,26,197,76,41,226,24,94,173,220,31,193,52,133,30,96,48,175,101,74,234,21,34,157,149,199,171,123];
const LUT_1=[5,53,175,100,143,191,14,218,89,127,219,209,208,44,173,16,134,13,178,213,95,7,18,35,247,147,48,121,148,23,31,240,180,45,232,200,122,204,52,50,197,81,215,211,123,20,182,170,150,6,62,101,47,84,168,92,24,154,4,179,225,153,255,85,166,96,220,106,129,51,155,210,104,130,55,224,108,245,15,86,82,253,46,238,40,156,73,164,54,188,157,102,187,222,74,107,76,249,43,67,80,160,198,29,189,167,64,195,136,3,158,236,8,72,221,25,231,112,1,77,41,68,214,97,207,186,12,124,128,78,172,177,144,21,176,151,137,202,149,99,212,251,26,234,33,113,57,235,79,193,11,125,241,217,111,126,169,75,132,226,61,42,88,91,201,70,140,159,19,93,116,162,28,216,203,119,190,142,49,36,243,83,141,161,115,69,199,230,118,63,22,9,66,32,227,192,171,252,246,205,38,60,120,105,114,183,117,109,131,250,194,223,27,98,94,87,0,59,2,163,174,138,196,65,254,103,10,185,71,146,239,39,135,244,34,139,56,90,30,206,184,233,165,133,248,145,228,229,110,17,237,181,152,37,58,242];
const LUT_2=[127,82,119,126,91,86,83,90,95,98,87,94,107,102,99,106,239,194,231,238,203,198,195,202,207,114,199,206,123,118,115,122,191,146,183,190,155,150,147,154,159,162,151,158,171,166,163,170,111,66,103,110,75,70,67,74,79,178,71,78,187,182,179,186,63,18,55,62,27,22,19,26,31,34,23,30,43,38,35,42,175,130,167,174,139,134,131,138,143,50,135,142,59,54,51,58,255,210,247,254,219,214,211,218,223,226,215,222,235,230,227,234,47,2,39,46,11,6,3,10,15,242,7,14,251,246,243,250,80,81,124,125,84,85,88,89,96,97,92,93,100,101,104,105,192,193,236,237,196,197,200,201,112,113,204,205,116,117,120,121,144,145,188,189,148,149,152,153,160,161,156,157,164,165,168,169,64,65,108,109,68,69,72,73,176,177,76,77,180,181,184,185,16,17,60,61,20,21,24,25,32,33,28,29,36,37,40,41,128,129,172,173,132,133,136,137,48,49,140,141,52,53,56,57,208,209,252,253,212,213,216,217,224,225,220,221,228,229,232,233,0,1,44,45,4,5,8,9,240,241,12,13,244,245,248,249];
const LUT_3=[212,36,68,52,84,100,132,116,148,230,6,246,22,166,198,182,214,38,70,54,86,102,134,118,150,228,4,244,20,164,196,180,213,37,69,53,85,101,133,117,149,231,7,247,23,167,199,183,215,39,71,55,87,103,135,119,151,229,5,245,21,165,197,181,24,56,40,72,88,120,104,136,216,250,234,10,154,186,170,202,26,58,42,74,90,122,106,138,218,248,232,8,152,184,168,200,25,57,41,73,89,121,105,137,217,251,235,11,155,187,171,203,27,59,43,75,91,123,107,139,219,249,233,9,153,185,169,201,32,64,48,80,96,128,112,144,226,2,242,18,162,194,178,210,34,66,50,82,98,130,114,146,224,0,240,16,160,192,176,208,33,65,49,81,97,129,113,145,227,3,243,19,163,195,179,211,35,67,51,83,99,131,115,147,225,1,241,17,161,193,177,209,28,60,44,76,92,124,108,140,222,254,238,14,158,190,174,206,30,62,46,78,94,126,110,142,220,252,236,12,156,188,172,204,29,61,45,77,93,125,109,141,223,255,239,15,159,191,175,207,31,63,47,79,95,127,111,143,221,253,237,13,157,189,173,205];
const LUT_4=[83,99,51,67,19,35,243,3,211,227,179,195,147,163,115,131,82,98,50,66,18,34,242,2,210,226,178,194,146,162,114,130,85,101,53,69,21,37,245,5,213,229,181,197,149,165,117,133,84,100,52,68,20,36,244,4,212,228,180,196,148,164,116,132,87,103,55,71,23,39,247,7,215,231,183,199,151,167,119,135,86,102,54,70,22,38,246,6,214,230,182,198,150,166,118,134,89,105,57,73,25,41,249,9,217,233,185,201,153,169,121,137,88,104,56,72,24,40,248,8,216,232,184,200,152,168,120,136,91,107,59,75,27,43,251,11,219,235,187,203,155,171,123,139,90,106,58,74,26,42,250,10,218,234,186,202,154,170,122,138,93,109,61,77,29,45,253,13,221,237,189,205,157,173,125,141,92,108,60,76,28,44,252,12,220,236,188,204,156,172,124,140,95,111,63,79,31,47,255,15,223,239,191,207,159,175,127,143,94,110,62,78,30,46,254,14,222,238,190,206,158,174,126,142,97,113,65,81,33,49,1,17,225,241,193,209,161,177,129,145,96,112,64,80,32,48,0,16,224,240,192,208,160,176,128,144];
const LUT_5=[0,63,57,62,56,43,37,42,36,35,221,34,220,39,33,38,32,223,217,222,216,219,213,218,212,211,205,210,204,215,209,214,208,207,201,206,200,251,245,250,244,243,237,242,236,247,241,246,240,239,233,238,232,203,197,202,196,195,253,194,252,199,193,198,192,255,249,254,248,235,229,234,228,227,157,226,156,231,225,230,224,159,153,158,152,91,85,90,84,83,77,82,76,87,81,86,80,79,73,78,72,123,117,122,116,115,109,114,108,119,113,118,112,111,105,110,104,75,69,74,68,67,125,66,124,71,65,70,64,127,121,126,120,107,101,106,100,99,29,98,28,103,97,102,96,31,25,30,24,155,149,154,148,147,141,146,140,151,145,150,144,143,137,142,136,187,181,186,180,179,173,178,172,183,177,182,176,175,169,174,168,139,133,138,132,131,189,130,188,135,129,134,128,191,185,190,184,171,165,170,164,163,93,162,92,167,161,166,160,95,89,94,88,27,21,26,20,19,13,18,12,23,17,22,16,15,9,14,8,59,53,58,52,51,45,50,44,55,49,54,48,47,41,46,40,11,5,10,4,3,61,2,60,7,1,6];
const LUT_6=[128,37,196,184,172,71,34,24,3,224,69,26,160,98,99,21,57,17,221,235,6,149,248,141,43,12,202,219,44,48,18,192,103,84,241,46,193,218,33,97,52,217,203,28,40,135,228,159,245,93,105,91,155,58,250,204,234,182,244,16,62,153,130,51,216,208,22,129,237,137,168,117,179,238,77,108,163,14,225,7,79,152,239,53,136,36,226,233,246,74,154,212,177,70,165,207,8,127,119,125,150,243,10,197,112,132,9,20,83,254,50,200,116,23,29,145,158,161,11,205,166,146,139,230,138,19,199,101,68,72,63,215,227,45,201,110,156,81,1,186,143,122,162,66,104,109,88,78,191,222,13,220,151,252,121,211,61,189,164,140,42,206,120,4,198,56,82,242,213,113,148,124,123,0,60,25,173,175,76,54,134,195,85,115,232,67,251,73,55,170,106,75,214,102,15,47,185,96,87,41,80,167,39,147,5,35,118,111,31,114,144,236,253,131,59,176,92,181,157,223,183,174,240,247,65,255,30,64,209,2,142,210,90,100,169,190,94,249,229,86,107,49,194,38,133,27,171,180,126,187,32,178,188,89,95,231];
const LUT_7=[82,210,251,24,187,59,190,197,224,52,201,157,177,10,255,186,103,66,215,173,116,102,158,22,233,155,250,160,147,166,118,241,211,2,33,97,140,65,218,222,109,176,169,153,132,154,231,7,167,110,62,16,246,152,35,200,170,199,90,219,29,207,57,144,39,56,193,12,95,214,203,149,40,87,230,49,8,237,182,172,156,61,254,245,42,195,96,19,238,131,127,44,139,117,76,4,72,141,6,84,184,51,101,194,63,43,120,89,99,86,119,1,106,104,125,226,41,248,114,64,34,88,165,48,185,135,74,136,115,188,3,223,179,146,243,171,79,69,175,20,145,137,206,5,50,240,162,9,180,93,70,128,221,205,244,60,15,68,83,21,130,14,168,196,77,108,67,123,150,192,216,23,202,161,73,228,55,183,242,26,217,148,191,31,212,80,105,37,236,54,174,98,92,58,25,113,11,129,229,189,46,138,232,32,220,235,208,0,91,133,85,121,198,28,124,164,122,134,94,27,247,71,81,112,53,36,78,143,100,151,249,38,107,209,30,75,234,204,126,181,227,13,47,111,225,159,17,45,252,178,253,239,163,18,142,213];
const LUT_8=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255];
export function decodeCn1622DamageParameters(payload: Uint8Array): number[] {
  const input = payload;
  if (input.length < 4) throw new RangeError('packet 12 payload header is truncated');
  let cursor = 4;
  const parameters: number[] = [];
  {
    const selector = bitsLE(input, 19, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 3212836864;
        break;
      case 1:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x10 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_0[input[start + 3]]) | ((LUT_0[input[start + 2]]) << 8) | ((LUT_0[input[start + 1]]) << 16) | ((LUT_0[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 2:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x10 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_0[input[start + 3]]) | ((LUT_0[input[start + 2]]) << 8) | ((LUT_0[input[start + 1]]) << 16) | ((LUT_0[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 3:
        value = 0;
        break;
      case 4:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x10 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_0[input[start + 3]]) | ((LUT_0[input[start + 2]]) << 8) | ((LUT_0[input[start + 1]]) << 16) | ((LUT_0[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 5:
        value = 1073741824;
        break;
      case 6:
        value = 1065353216;
        break;
      case 7:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x10 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_0[input[start + 3]]) | ((LUT_0[input[start + 2]]) << 8) | ((LUT_0[input[start + 1]]) << 16) | ((LUT_0[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      default: throw new RangeError('packet 12 field 0 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 22, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 1:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 4:
        value = 0;
        break;
      case 5:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 6:
        value = 4294967295;
        break;
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 12 field 1 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 25, 3);
    let value: number;
    switch (selector) {
      case 0:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 1:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 2:
        value = 0;
        break;
      case 3:
        value = 1;
        break;
      case 4:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 5:
        value = 255;
        break;
      case 6:
        value = 2;
        break;
      case 7:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      default: throw new RangeError('packet 12 field 2 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 15, 1);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        value = 1;
        break;
      default: throw new RangeError('packet 12 field 3 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 16, 3);
    let value: number;
    switch (selector) {
      case 0:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_3[input[start + 3]]) | ((LUT_3[input[start + 2]]) << 8) | ((LUT_3[input[start + 1]]) << 16) | ((LUT_3[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 1:
        value = 1073741824;
        break;
      case 2:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_3[input[start + 3]]) | ((LUT_3[input[start + 2]]) << 8) | ((LUT_3[input[start + 1]]) << 16) | ((LUT_3[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 3:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_3[input[start + 3]]) | ((LUT_3[input[start + 2]]) << 8) | ((LUT_3[input[start + 1]]) << 16) | ((LUT_3[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 4:
        value = 1065353216;
        break;
      case 5:
        value = 3212836864;
        break;
      case 6:
        if (cursor + 4 > input.length) throw new RangeError('packet 12 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_3[input[start + 3]]) | ((LUT_3[input[start + 2]]) << 8) | ((LUT_3[input[start + 1]]) << 16) | ((LUT_3[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 7:
        value = 0;
        break;
      default: throw new RangeError('packet 12 field 4 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 3, 3);
    let value: number;
    switch (selector) {
      case 0:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x20 is truncated');
        value = input[cursor++];
        value = LUT_4[value];
        break;
      case 1:
        value = 0;
        break;
      case 2:
        value = 255;
        break;
      case 3:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x20 is truncated');
        value = input[cursor++];
        value = LUT_4[value];
        break;
      case 4:
        value = 1;
        break;
      case 5:
        value = 2;
        break;
      case 6:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x20 is truncated');
        value = input[cursor++];
        value = LUT_4[value];
        break;
      case 7:
        if (cursor >= input.length) throw new RangeError('packet 12 field field_0x20 is truncated');
        value = input[cursor++];
        value = LUT_4[value];
        break;
      default: throw new RangeError('packet 12 field 5 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 9, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 1:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 4:
        value = 0;
        break;
      case 5:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 6:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 7:
        value = 4294967295;
        break;
      default: throw new RangeError('packet 12 field 6 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 6, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 4:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 5:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 6:
        value = 4294967295;
        break;
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 12 field 7 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 0, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 4294967295;
        break;
      case 1:
        value = 2;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x2c has a truncated varuint32');
            decodedByte = LUT_7[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x2c has a truncated varuint32');
            decodedByte = LUT_7[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 4:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x2c has a truncated varuint32');
            decodedByte = LUT_7[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 5:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte: number;
          do {
            if (cursor >= input.length) throw new RangeError('packet 12 field field_0x2c has a truncated varuint32');
            decodedByte = LUT_7[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 6:
        value = 1;
        break;
      case 7:
        value = 0;
        break;
      default: throw new RangeError('packet 12 field 8 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 12, 3);
    let value: number;
    switch (selector) {
      case 0:
        if (cursor + 1 > input.length) throw new RangeError('packet 12 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_8[input[start + 0]];
        }
        break;
      case 1:
        if (cursor + 1 > input.length) throw new RangeError('packet 12 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_8[input[start + 0]];
        }
        break;
      case 2:
        value = 0;
        break;
      case 3:
        value = 1;
        break;
      case 4:
        if (cursor + 1 > input.length) throw new RangeError('packet 12 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_8[input[start + 0]];
        }
        break;
      case 5:
        value = 255;
        break;
      case 6:
        if (cursor + 1 > input.length) throw new RangeError('packet 12 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_8[input[start + 0]];
        }
        break;
      case 7:
        value = 2;
        break;
      default: throw new RangeError('packet 12 field 9 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  if (cursor !== input.length) throw new RangeError('damage packet has unconsumed bytes');
  return parameters;
}
