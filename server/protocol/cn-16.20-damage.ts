// Generated protocol decoder for CN 16.20.824.8524.
// Extracted with shyunku-libraries/rofl-parser (ISC), with a CN factory adapter.
// Research input EXE SHA256: EE3C887B4579AEAB12CA77B2A43CC1CC3411A8AA30BC43D2DFEA856F6CE497C8.
// Do not infer compatibility from patch numbers: validate the complete build.
function bitsLE(input: Uint8Array, offset: number, length: number): number {
  let value=0; for(let i=0;i<length;i++) value|=((input[(offset+i)>>>3]>>>((offset+i)&7))&1)<<i; return value;
}
const LUT_0=[0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,120,128,136,144,152,160,168,176,184,192,200,208,216,224,232,240,248,1,9,17,25,33,41,49,57,65,73,81,89,97,105,113,121,129,137,145,153,161,169,177,185,193,201,209,217,225,233,241,249,2,10,18,26,34,42,50,58,66,74,82,90,98,106,114,122,130,138,146,154,162,170,178,186,194,202,210,218,226,234,242,250,3,11,19,27,35,43,51,59,67,75,83,91,99,107,115,123,131,139,147,155,163,171,179,187,195,203,211,219,227,235,243,251,4,12,20,28,36,44,52,60,68,76,84,92,100,108,116,124,132,140,148,156,164,172,180,188,196,204,212,220,228,236,244,252,5,13,21,29,37,45,53,61,69,77,85,93,101,109,117,125,133,141,149,157,165,173,181,189,197,205,213,221,229,237,245,253,6,14,22,30,38,46,54,62,70,78,86,94,102,110,118,126,134,142,150,158,166,174,182,190,198,206,214,222,230,238,246,254,7,15,23,31,39,47,55,63,71,79,87,95,103,111,119,127,135,143,151,159,167,175,183,191,199,207,215,223,231,239,247,255];
const LUT_1=[25,21,160,156,168,164,176,172,184,180,192,188,200,196,208,204,216,212,96,92,104,100,112,108,120,116,128,124,136,132,144,140,152,148,32,28,40,36,48,44,56,52,64,60,72,68,80,76,88,84,224,220,232,228,240,236,248,244,0,252,8,4,16,12,24,20,159,155,167,163,175,171,183,179,191,187,199,195,207,203,215,211,95,91,103,99,111,107,119,115,127,123,135,131,143,139,151,147,31,27,39,35,47,43,55,51,63,59,71,67,79,75,87,83,223,219,231,227,239,235,247,243,255,251,7,3,15,11,23,19,158,154,166,162,174,170,182,178,190,186,198,194,206,202,214,210,94,90,102,98,110,106,118,114,126,122,134,130,142,138,150,146,30,26,38,34,46,42,54,50,62,58,70,66,78,74,86,82,222,218,230,226,238,234,246,242,254,250,6,2,14,10,22,18,161,157,169,165,177,173,185,181,193,189,201,197,209,205,217,213,97,93,105,101,113,109,121,117,129,125,137,133,145,141,153,149,33,29,41,37,49,45,57,53,65,61,73,69,81,77,89,85,225,221,233,229,241,237,249,245,1,253,9,5,17,13];
const LUT_2=[3,13,15,9,11,245,247,241,243,253,255,249,251,229,231,225,227,237,239,233,235,213,215,209,211,221,223,217,219,197,199,193,195,205,207,201,203,181,183,177,179,189,191,185,187,165,167,161,163,173,175,169,171,149,151,145,147,157,159,153,132,134,128,130,140,142,136,138,116,118,112,114,124,126,120,122,100,102,96,98,108,110,104,106,84,86,80,82,92,94,88,90,68,70,64,66,76,78,72,74,52,54,48,50,60,62,56,58,36,38,32,34,44,46,40,42,20,22,16,18,28,30,24,26,4,6,0,2,12,14,8,10,244,246,240,242,252,254,248,250,228,230,224,226,236,238,232,234,212,214,208,210,220,222,216,218,196,198,192,194,204,206,200,202,180,182,176,178,188,190,184,186,164,166,160,162,172,174,168,170,148,150,144,146,156,158,152,154,133,135,129,155,141,143,137,131,117,119,113,139,125,127,121,115,101,103,97,123,109,111,105,99,85,87,81,107,93,95,89,83,69,71,65,91,77,79,73,67,53,55,49,75,61,63,57,51,37,39,33,59,45,47,41,35,21,23,17,43,29,31,25,19,5,7,1,27];
const LUT_3=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255];
const LUT_4=[73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,255,254,253,252,251,250,249,248,247,246,245,244,243,242,241,240,239,238,237,236,235,234,233,232,231,230,229,228,227,226,225,224,223,222,221,220,219,218,217,216,215,214,213,212,211,210,209,208,207,206,205,204,203,202,201,200,199,198,197,196,195,194,193,192,191,190,189,188,187,186,185,184,183,182,181,180,179,178,177,176,175,174,173,172,171,170,169,168,167,166,165,164,163,162,161,160,159,158,157,156,155,154,153,152,151,150,149,148,147,146,145,144,143,142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123,122,121,120,119,118,117,116,115,114,113,112,111,110,109,108,107,106,105,104,103,102,101,100,99,98,97,96,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74];
const LUT_5=[105,251,23,116,159,187,51,76,149,111,61,68,175,225,75,156,8,236,81,69,240,197,33,177,227,161,114,55,28,119,5,170,198,201,1,207,179,67,125,223,229,169,14,10,164,133,3,194,44,208,113,130,154,92,35,93,129,118,108,163,4,84,245,224,128,248,231,90,50,58,112,24,107,252,147,54,217,47,19,211,233,142,221,102,137,146,117,60,122,136,37,193,95,12,115,250,235,101,234,21,121,29,120,139,243,172,155,144,87,153,52,30,127,72,178,131,53,145,239,183,205,182,22,249,9,186,109,63,83,20,219,152,214,212,40,18,247,204,143,230,79,180,190,216,62,49,253,241,104,232,94,188,209,39,71,200,157,27,6,41,80,36,151,196,254,166,66,215,34,237,124,162,17,31,123,32,64,184,167,46,222,210,244,246,48,26,85,91,110,191,106,199,132,168,174,141,160,89,59,140,138,171,134,16,57,150,78,88,206,25,238,213,173,0,7,202,86,42,70,38,77,65,2,220,181,189,135,203,228,103,45,82,185,158,13,74,195,98,218,11,56,165,226,73,99,15,96,192,148,242,43,255,176,126,100,97];
const LUT_6=[145,72,24,162,249,224,254,237,183,79,6,76,200,193,213,100,242,147,101,96,222,118,139,10,68,161,57,31,234,92,21,103,3,155,205,177,37,61,174,22,232,219,165,178,12,132,49,112,20,167,241,133,160,54,116,246,168,47,32,89,228,83,169,179,67,122,87,123,114,154,141,251,28,159,42,129,244,73,221,182,149,247,124,192,55,17,189,191,152,11,231,187,225,253,194,18,23,201,250,125,229,166,48,157,164,173,9,34,204,19,26,78,218,181,27,190,136,142,16,109,77,135,80,156,248,70,235,188,105,35,102,243,172,25,252,202,85,0,51,240,98,223,43,63,29,186,93,134,212,14,207,75,170,74,95,36,97,65,117,209,110,94,153,44,185,184,150,90,120,7,71,91,52,126,99,64,230,111,199,5,81,106,151,203,127,146,158,121,113,33,4,53,41,143,2,131,220,130,86,215,104,46,214,59,82,144,119,140,208,216,115,56,211,210,176,58,137,15,45,62,163,238,88,195,198,128,107,197,50,175,196,8,245,217,171,138,226,239,38,255,69,13,236,39,1,233,40,227,148,84,66,108,180,60,30,206];
const LUT_7=[250,252,254,240,242,244,246,136,138,140,142,128,130,132,134,152,154,156,158,144,146,148,150,168,170,172,174,160,162,164,166,184,186,188,190,176,178,180,182,73,75,77,79,65,67,69,71,89,91,93,95,81,83,85,87,105,107,109,111,97,99,101,103,121,123,125,127,113,115,117,119,9,11,13,15,1,3,5,7,25,27,29,31,17,19,21,23,41,43,45,47,33,35,37,39,57,59,61,63,49,51,53,55,201,203,205,207,193,195,197,199,217,219,221,223,209,211,213,215,233,235,237,239,225,227,229,231,249,251,253,255,241,243,245,247,137,139,141,143,129,131,133,135,153,155,157,159,145,147,149,151,169,171,173,175,161,163,165,167,185,187,189,191,177,179,181,183,72,74,76,78,64,66,68,70,88,90,92,94,80,82,84,86,104,106,108,110,96,98,100,102,120,122,124,126,112,114,116,118,8,10,12,14,0,2,4,6,24,26,28,30,16,18,20,22,40,42,44,46,32,34,36,38,56,58,60,62,48,50,52,54,200,202,204,206,192,194,196,198,216,218,220,222,208,210,212,214,232,234,236,238,224,226,228,230,248];
export function decodeCnDamageParameters(payload: Uint8Array): number[] {
  const input = payload;
  if (input.length < 4) throw new RangeError('packet 359 payload header is truncated');
  let cursor = 4;
  const parameters: number[] = [];
  {
    const selector = bitsLE(input, 25, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
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
      default: throw new RangeError('packet 359 field 0 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 0, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
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
        value = 4294967295;
        break;
      case 5:
        value = 0;
        break;
      case 6:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x14 has a truncated varuint32');
            decodedByte = LUT_1[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 359 field 1 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 19, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor >= input.length) throw new RangeError('packet 359 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 1:
        value = 2;
        break;
      case 2:
        if (cursor >= input.length) throw new RangeError('packet 359 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 3:
        value = 0;
        break;
      case 4:
        value = 4;
        break;
      case 5:
        if (cursor >= input.length) throw new RangeError('packet 359 field field_0x18 is truncated');
        value = input[cursor++];
        value = LUT_2[value];
        break;
      case 6:
        value = 1;
        break;
      case 7:
        value = 255;
        break;
      default: throw new RangeError('packet 359 field 2 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 3, 3);
    let value;
    switch (selector) {
      case 0:
        value = 1;
        break;
      case 1:
        value = 2;
        break;
      case 2:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x19 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 3:
        value = 255;
        break;
      case 4:
        value = 0;
        break;
      case 5:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x19 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 6:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x19 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 7:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x19 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      default: throw new RangeError('packet 359 field 3 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 15, 1);
    let value;
    switch (selector) {
      case 0:
        value = 1;
        break;
      case 1:
        value = 0;
        break;
      default: throw new RangeError('packet 359 field 4 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 22, 3);
    let value;
    switch (selector) {
      case 0:
        value = 4294967295;
        break;
      case 1:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x1c has a truncated varuint32');
            decodedByte = LUT_4[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 2:
        value = 1;
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x1c has a truncated varuint32');
            decodedByte = LUT_4[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 4:
        value = 2;
        break;
      case 5:
        value = 0;
        break;
      case 6:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x1c has a truncated varuint32');
            decodedByte = LUT_4[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x1c has a truncated varuint32');
            decodedByte = LUT_4[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      default: throw new RangeError('packet 359 field 5 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 16, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_5[input[start + 0]]) | ((LUT_5[input[start + 1]]) << 8) | ((LUT_5[input[start + 2]]) << 16) | ((LUT_5[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 1:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_5[input[start + 0]]) | ((LUT_5[input[start + 1]]) << 8) | ((LUT_5[input[start + 2]]) << 16) | ((LUT_5[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 2:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_5[input[start + 0]]) | ((LUT_5[input[start + 1]]) << 8) | ((LUT_5[input[start + 2]]) << 16) | ((LUT_5[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 3:
        value = 0;
        break;
      case 4:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_5[input[start + 0]]) | ((LUT_5[input[start + 1]]) << 8) | ((LUT_5[input[start + 2]]) << 16) | ((LUT_5[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 5:
        value = 1073741824;
        break;
      case 6:
        value = 1065353216;
        break;
      case 7:
        value = 3212836864;
        break;
      default: throw new RangeError('packet 359 field 6 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 6, 3);
    let value;
    switch (selector) {
      case 0:
        value = 255;
        break;
      case 1:
        value = 0;
        break;
      case 2:
        value = 1;
        break;
      case 3:
        value = 2;
        break;
      case 4:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x24 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 5:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x24 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 6:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x24 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 7:
        if (cursor + 1 > input.length) throw new RangeError('packet 359 field field_0x24 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      default: throw new RangeError('packet 359 field 7 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 12, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 359 field field_0x28 has a truncated varuint32');
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
        value = 0;
        break;
      case 7:
        value = 4294967295;
        break;
      default: throw new RangeError('packet 359 field 8 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 9, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        value = 1073741824;
        break;
      case 2:
        value = 3212836864;
        break;
      case 3:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 0]]) | ((LUT_7[input[start + 1]]) << 8) | ((LUT_7[input[start + 2]]) << 16) | ((LUT_7[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 4:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 0]]) | ((LUT_7[input[start + 1]]) << 8) | ((LUT_7[input[start + 2]]) << 16) | ((LUT_7[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 5:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 0]]) | ((LUT_7[input[start + 1]]) << 8) | ((LUT_7[input[start + 2]]) << 16) | ((LUT_7[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 6:
        if (cursor + 4 > input.length) throw new RangeError('packet 359 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 0]]) | ((LUT_7[input[start + 1]]) << 8) | ((LUT_7[input[start + 2]]) << 16) | ((LUT_7[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 7:
        value = 1065353216;
        break;
      default: throw new RangeError('packet 359 field 9 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  if (cursor !== input.length) throw new RangeError('Unexpected damage packet tail');
  return parameters;
}
