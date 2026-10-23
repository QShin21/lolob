// Generated protocol decoder for CN 16.21.829.9102.
// Extracted with shyunku-libraries/rofl-parser (ISC), with a CN factory adapter.
// Research input EXE SHA256: 6CA9446AC4E65A311CB0796B72A459097CDF912A337619D1D1FD207E01AEDD6F.
// Packet registration: 978; factory 0xC984F0; deserializer 0xCD81B0; handler 0x2B55A0.
// Do not infer compatibility from patch numbers: validate the complete build.
function bitsLE(input: Uint8Array, offset: number, length: number): number {
  let value=0; for(let i=0;i<length;i++) value|=((input[(offset+i)>>>3]>>>((offset+i)&7))&1)<<i; return value;
}
const LUT_0=[62,98,216,46,184,220,247,139,73,108,203,209,145,22,214,0,128,54,163,210,76,64,2,95,228,195,33,105,130,52,60,177,162,86,165,133,43,134,34,35,206,81,196,211,107,1,148,151,116,255,28,110,88,18,149,10,248,123,253,227,237,185,236,82,160,45,138,39,189,99,187,147,37,127,84,173,38,242,56,4,19,234,24,168,21,122,69,158,20,154,186,48,219,140,7,103,6,233,87,79,17,157,144,58,218,224,13,207,117,63,124,166,244,5,202,57,240,49,61,70,85,14,132,109,200,155,245,42,125,8,150,225,129,66,161,180,181,135,194,111,146,235,250,167,93,113,89,231,72,205,55,106,241,201,104,44,213,71,126,175,90,23,9,75,197,16,118,188,67,74,50,159,249,137,199,100,156,120,97,30,243,83,182,221,115,78,208,176,36,92,3,53,15,29,239,141,215,170,164,198,32,26,41,101,51,212,114,102,191,171,143,204,59,47,12,68,252,91,254,223,152,119,142,77,172,112,246,217,80,131,232,96,192,178,31,183,25,11,251,136,153,229,222,190,169,193,174,238,40,65,230,226,121,94,27,179];
const LUT_1=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255];
const LUT_2=[100,73,136,200,115,90,153,29,35,57,106,97,155,244,234,50,152,9,166,1,95,47,65,201,228,21,43,11,199,227,131,46,249,198,17,133,5,240,18,141,140,250,81,185,38,183,130,134,219,62,0,16,159,45,221,54,176,195,165,232,83,36,245,212,24,252,27,138,102,124,53,146,161,77,226,33,190,179,42,206,202,229,7,107,169,248,13,203,184,241,19,237,79,22,68,189,76,128,164,215,197,30,129,254,158,58,122,2,216,144,236,175,208,253,125,211,3,178,148,34,120,40,25,180,114,20,247,4,87,193,217,174,8,66,204,168,223,123,85,28,196,143,112,142,177,224,162,214,104,147,64,156,218,194,109,14,86,71,93,117,127,26,150,101,52,48,15,213,110,103,92,98,80,151,91,192,6,251,23,55,51,12,243,137,126,113,78,167,163,111,231,10,37,39,239,75,187,56,191,105,171,172,210,173,181,233,182,116,186,242,209,132,31,119,222,61,41,188,135,170,246,99,59,32,49,82,72,44,74,121,139,96,67,235,207,60,230,88,157,154,220,89,238,145,160,63,205,225,255,70,69,118,149,84,94,108];
const LUT_3=[137,8,201,72,183,54,247,118,138,9,202,73,136,55,200,119,177,48,241,112,191,62,255,126,178,49,242,113,176,63,240,127,181,52,245,116,179,50,243,114,182,53,246,117,180,51,244,115,189,60,253,124,187,58,251,122,190,61,254,125,188,59,252,123,169,40,233,104,151,22,215,86,170,41,234,105,168,23,232,87,145,16,209,80,159,30,223,94,146,17,210,81,144,31,208,95,149,20,213,84,147,18,211,82,150,21,214,85,148,19,212,83,157,28,221,92,155,26,219,90,158,29,222,93,156,27,220,91,153,24,217,88,135,6,199,70,154,25,218,89,152,7,216,71,129,0,193,64,143,14,207,78,130,1,194,65,128,15,192,79,133,4,197,68,131,2,195,66,134,5,198,69,132,3,196,67,141,12,205,76,139,10,203,74,142,13,206,77,140,11,204,75,185,56,249,120,167,38,231,102,186,57,250,121,184,39,248,103,161,32,225,96,175,46,239,110,162,33,226,97,160,47,224,111,165,36,229,100,163,34,227,98,166,37,230,101,164,35,228,99,173,44,237,108,171,42,235,106,174,45,238,109,172,43,236,107];
const LUT_4=[50,250,221,132,255,145,31,136,154,177,155,82,193,202,223,231,148,120,135,72,83,81,53,168,252,49,234,57,91,195,35,68,14,48,228,26,38,163,23,20,24,222,105,65,119,164,36,179,139,171,133,207,243,194,116,157,13,198,235,1,61,56,130,47,102,229,108,140,182,200,43,146,112,88,41,225,10,210,219,183,196,85,16,190,75,78,175,230,239,204,121,151,138,60,170,98,110,29,159,8,80,211,144,251,122,109,126,172,191,162,70,0,232,245,150,9,44,21,62,201,167,17,236,244,52,74,115,217,247,30,97,90,12,125,101,93,28,238,215,249,165,55,224,95,7,15,106,169,131,166,33,64,99,54,19,180,66,147,206,27,160,32,71,187,113,22,2,253,246,152,128,156,188,137,123,67,107,220,213,212,216,114,129,173,59,254,3,69,176,158,111,76,185,233,79,5,117,240,241,18,6,141,89,118,92,181,143,34,178,87,208,192,103,124,237,42,248,77,73,203,51,205,58,45,226,189,63,37,218,214,134,39,242,94,174,96,127,199,161,86,104,186,197,149,11,142,100,184,227,84,153,25,4,40,209,46];
const LUT_5=[99,100,101,102,95,96,97,98,91,92,93,94,87,88,89,90,83,84,85,86,79,80,81,82,75,76,77,78,71,72,73,74,67,68,69,70,63,64,65,66,59,60,61,62,55,56,57,58,51,52,53,54,47,48,49,50,43,44,45,46,39,40,41,42,35,36,37,38,31,32,33,34,27,28,29,30,23,24,25,26,19,20,21,22,15,16,17,18,11,12,13,14,7,8,9,10,3,4,5,6,255,0,1,2,251,252,253,254,247,248,249,250,243,244,245,246,239,240,241,242,235,236,237,238,231,232,233,234,227,228,229,230,223,224,225,226,219,220,221,222,215,216,217,218,211,212,213,214,207,208,209,210,203,204,205,206,199,200,201,202,195,196,197,198,191,192,193,194,187,188,189,190,183,184,185,186,179,180,181,182,175,176,177,178,171,172,173,174,167,168,169,170,163,164,165,166,159,160,161,162,155,156,157,158,151,152,153,154,147,148,149,150,143,144,145,146,139,140,141,142,135,136,137,138,131,132,133,134,127,128,129,130,123,124,125,126,119,120,121,122,115,116,117,118,111,112,113,114,107,108,109,110,103,104,105,106];
const LUT_6=[144,17,145,18,146,19,147,20,148,21,149,22,150,23,151,24,152,25,153,26,154,27,155,28,156,29,157,30,158,31,159,32,160,33,161,34,162,35,163,36,164,37,165,38,166,39,167,40,168,41,169,42,170,43,171,44,172,45,173,46,174,47,175,48,176,49,177,50,178,51,179,52,180,53,181,54,182,55,183,56,184,57,185,58,186,59,187,60,188,61,189,62,190,63,191,64,192,65,193,66,194,67,195,68,196,69,197,70,198,71,199,72,200,73,201,74,202,75,203,76,204,77,205,78,206,79,207,80,208,81,209,82,210,83,211,84,212,85,213,86,214,87,215,88,216,89,217,90,218,91,219,92,220,93,221,94,222,95,223,96,224,97,225,98,226,99,227,100,228,101,229,102,230,103,231,104,232,105,233,106,234,107,235,108,236,109,237,110,238,111,239,112,240,113,241,114,242,115,243,116,244,117,245,118,246,119,247,120,248,121,249,122,250,123,251,124,252,125,253,126,254,127,255,0,128,1,129,2,130,3,131,4,132,5,133,6,134,7,135,8,136,9,137,10,138,11,139,12,140,13,141,14,142,15,143,16];
const LUT_7=[146,33,143,130,7,126,111,106,74,65,94,184,0,223,186,14,135,70,35,25,173,19,181,142,11,253,201,166,159,73,247,17,47,83,122,154,219,132,167,54,161,92,155,61,79,193,147,118,84,60,72,224,217,239,13,233,15,238,128,175,46,144,216,210,127,113,41,220,120,52,230,81,170,97,110,185,85,98,29,212,77,248,105,172,164,204,218,136,152,225,23,229,28,244,149,55,168,228,67,114,232,12,20,160,68,234,3,37,183,200,242,222,148,180,145,249,245,226,69,1,137,163,198,50,104,82,208,211,121,53,131,215,91,64,5,203,36,209,44,90,240,63,134,75,156,188,243,202,34,78,190,109,187,18,125,157,129,182,192,191,89,179,123,251,178,112,133,246,31,103,177,22,76,100,96,10,108,206,162,237,138,255,39,227,62,195,197,8,59,140,56,58,158,4,2,86,71,99,199,151,95,117,153,150,51,43,93,207,80,235,102,252,9,26,27,16,231,194,250,48,42,221,124,189,32,169,87,141,165,49,241,116,57,21,205,174,6,213,101,139,66,30,24,254,171,38,236,40,45,88,107,196,214,119,115,176];
export function decodeCn1621DamageParameters(payload: Uint8Array): number[] {
  const input = payload;
  if (input.length < 4) throw new RangeError('packet 978 payload header is truncated');
  let cursor = 4;
  const parameters: number[] = [];
  {
    const selector = bitsLE(input, 10, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
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
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x10 has a truncated varuint32');
            decodedByte = LUT_0[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 978 field 0 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 6, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x14 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 1:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x14 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 2:
        value = 1;
        break;
      case 3:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x14 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 4:
        value = 2;
        break;
      case 5:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x14 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 6:
        value = 0;
        break;
      case 7:
        value = 255;
        break;
      default: throw new RangeError('packet 978 field 1 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 13, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x18 has a truncated varuint32');
            decodedByte = LUT_2[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 1:
        value = 2;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x18 has a truncated varuint32');
            decodedByte = LUT_2[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 3:
        value = 1;
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x18 has a truncated varuint32');
            decodedByte = LUT_2[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      case 6:
        value = 4294967295;
        break;
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x18 has a truncated varuint32');
            decodedByte = LUT_2[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        break;
      default: throw new RangeError('packet 978 field 2 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 25, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 2:
        value = 255;
        break;
      case 3:
        value = 1;
        break;
      case 4:
        value = 2;
        break;
      case 5:
        value = 5;
        break;
      case 6:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      case 7:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x1c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_3[input[start + 0]];
        }
        break;
      default: throw new RangeError('packet 978 field 3 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 22, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_4[input[start + 0]]) | ((LUT_4[input[start + 1]]) << 8) | ((LUT_4[input[start + 2]]) << 16) | ((LUT_4[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 1:
        value = 0;
        break;
      case 2:
        value = 3212836864;
        break;
      case 3:
        value = 1073741824;
        break;
      case 4:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_4[input[start + 0]]) | ((LUT_4[input[start + 1]]) << 8) | ((LUT_4[input[start + 2]]) << 16) | ((LUT_4[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 5:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_4[input[start + 0]]) | ((LUT_4[input[start + 1]]) << 8) | ((LUT_4[input[start + 2]]) << 16) | ((LUT_4[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 6:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x20 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_4[input[start + 0]]) | ((LUT_4[input[start + 1]]) << 8) | ((LUT_4[input[start + 2]]) << 16) | ((LUT_4[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 7:
        value = 1065353216;
        break;
      default: throw new RangeError('packet 978 field 4 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 19, 3);
    let value;
    switch (selector) {
      case 0:
        value = 4294967295;
        break;
      case 1:
        value = 0;
        break;
      case 2:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
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
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
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
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
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
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x24 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 978 field 5 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 3, 3);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
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
        break;
      case 2:
        value = 4294967295;
        break;
      case 3:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
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
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
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
            if (cursor >= input.length) throw new RangeError('packet 978 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
          if ((decodedByte & 128) !== 0 || bytesRead === 5 && decodedByte > 15) throw new RangeError('Invalid damage packet varuint');
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      default: throw new RangeError('packet 978 field 6 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 16, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 1:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 2:
        value = 2;
        break;
      case 3:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 4:
        if (cursor + 1 > input.length) throw new RangeError('packet 978 field field_0x2c is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 5:
        value = 0;
        break;
      case 6:
        value = 255;
        break;
      case 7:
        value = 1;
        break;
      default: throw new RangeError('packet 978 field 7 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 0, 3);
    let value;
    switch (selector) {
      case 0:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 3]]) | ((LUT_7[input[start + 2]]) << 8) | ((LUT_7[input[start + 1]]) << 16) | ((LUT_7[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 1:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 3]]) | ((LUT_7[input[start + 2]]) << 8) | ((LUT_7[input[start + 1]]) << 16) | ((LUT_7[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 2:
        value = 1073741824;
        break;
      case 3:
        value = 0;
        break;
      case 4:
        value = 1065353216;
        break;
      case 5:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 3]]) | ((LUT_7[input[start + 2]]) << 8) | ((LUT_7[input[start + 1]]) << 16) | ((LUT_7[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 6:
        if (cursor + 4 > input.length) throw new RangeError('packet 978 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_7[input[start + 3]]) | ((LUT_7[input[start + 2]]) << 8) | ((LUT_7[input[start + 1]]) << 16) | ((LUT_7[input[start + 0]]) << 24)) >>> 0;
        }
        break;
      case 7:
        value = 3212836864;
        break;
      default: throw new RangeError('packet 978 field 8 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 9, 1);
    let value;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        value = 1;
        break;
      default: throw new RangeError('packet 978 field 9 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  if (cursor !== input.length) throw new RangeError('Unexpected damage packet tail');
  return parameters;
}
