// Extracted offline from the CN 16.23.840.6595 observer image using rofl-parser (ISC).
// Packet 840; factory 0xCC2730, deserializer 0xD112E0.

function bitsLE(input: Uint8Array, bitOffset: number, bitLength: number): number {
  let value = 0;
  for (let index = 0; index < bitLength; index += 1) {
    const absoluteBit = bitOffset + index;
    value |= ((input[absoluteBit >>> 3] >>> (absoluteBit & 7)) & 1) << index;
  }
  return value;
}

const LUT_0 = [
  119, 64, 61, 188, 96, 25, 187, 190, 116, 7, 84, 240, 133, 209, 50, 88,
  14, 225, 24, 251, 37, 95, 0, 127, 72, 78, 249, 15, 169, 10, 223, 233,
  86, 62, 110, 158, 175, 234, 83, 38, 102, 94, 104, 137, 115, 162, 53, 68,
  1, 55, 63, 255, 142, 13, 98, 74, 227, 149, 89, 246, 18, 181, 69, 154,
  31, 201, 211, 185, 140, 109, 178, 67, 194, 163, 76, 35, 80, 203, 231, 47,
  107, 144, 42, 30, 196, 198, 200, 113, 230, 224, 106, 214, 112, 6, 183, 151,
  179, 52, 79, 101, 108, 4, 184, 57, 239, 126, 135, 81, 177, 75, 165, 155,
  29, 129, 237, 208, 56, 65, 141, 232, 241, 171, 147, 235, 91, 32, 82, 132,
  138, 130, 114, 168, 189, 219, 221, 54, 117, 131, 93, 150, 28, 20, 180, 253,
  213, 49, 36, 173, 48, 164, 44, 70, 11, 124, 40, 252, 92, 148, 248, 146,
  16, 145, 2, 152, 134, 105, 204, 41, 128, 229, 202, 159, 182, 167, 19, 100,
  39, 9, 122, 193, 166, 212, 58, 215, 71, 97, 85, 245, 27, 59, 60, 99,
  17, 218, 244, 73, 197, 90, 26, 170, 172, 21, 222, 136, 103, 192, 216, 186,
  153, 66, 139, 12, 238, 43, 120, 174, 220, 199, 23, 34, 243, 228, 33, 247,
  22, 176, 87, 3, 121, 205, 118, 226, 5, 207, 191, 123, 195, 161, 111, 51,
  217, 250, 157, 160, 206, 143, 156, 77, 210, 236, 125, 254, 242, 46, 45, 8,
];

const LUT_1 = [
  48, 101, 94, 123, 193, 89, 56, 166, 13, 153, 95, 49, 227, 211, 76, 26,
  203, 81, 14, 202, 130, 183, 154, 167, 114, 72, 244, 200, 242, 233, 191, 234,
  161, 199, 109, 135, 16, 136, 147, 103, 235, 174, 156, 25, 217, 118, 97, 40,
  104, 128, 198, 129, 51, 252, 82, 90, 137, 163, 215, 93, 196, 30, 85, 177,
  28, 240, 220, 4, 179, 190, 155, 254, 162, 9, 253, 11, 207, 180, 158, 115,
  1, 145, 66, 108, 113, 223, 35, 60, 69, 185, 149, 10, 7, 8, 83, 121,
  20, 53, 3, 47, 86, 24, 205, 15, 21, 176, 160, 173, 245, 165, 68, 38,
  5, 164, 222, 19, 46, 178, 44, 98, 236, 250, 127, 159, 243, 140, 175, 171,
  141, 188, 189, 12, 201, 134, 45, 212, 34, 213, 84, 182, 152, 119, 208, 170,
  157, 111, 238, 22, 218, 64, 52, 224, 27, 248, 172, 62, 151, 61, 226, 100,
  117, 204, 219, 241, 246, 131, 70, 184, 71, 209, 139, 225, 42, 124, 17, 41,
  126, 75, 6, 0, 210, 237, 216, 37, 74, 255, 99, 146, 239, 91, 80, 112,
  249, 106, 102, 138, 55, 194, 96, 231, 110, 251, 230, 186, 65, 148, 58, 32,
  31, 122, 88, 214, 107, 221, 59, 247, 18, 57, 181, 33, 125, 192, 169, 116,
  29, 43, 73, 78, 187, 23, 67, 50, 144, 132, 105, 229, 79, 36, 92, 39,
  63, 150, 77, 195, 142, 54, 120, 197, 206, 133, 87, 228, 232, 168, 2, 143,
];

const LUT_2 = [
  140, 175, 129, 126, 24, 232, 176, 14, 240, 52, 149, 254, 185, 101, 168, 50,
  18, 114, 235, 139, 233, 41, 234, 159, 143, 21, 127, 20, 228, 113, 122, 125,
  46, 253, 95, 56, 13, 26, 215, 65, 89, 67, 171, 19, 207, 48, 229, 198,
  44, 249, 119, 83, 91, 58, 51, 236, 230, 70, 38, 112, 72, 63, 69, 252,
  150, 123, 155, 250, 183, 146, 60, 216, 92, 214, 99, 17, 184, 8, 76, 124,
  59, 87, 55, 221, 100, 178, 110, 49, 118, 117, 165, 128, 131, 151, 97, 227,
  137, 251, 86, 255, 40, 213, 169, 152, 33, 170, 54, 35, 108, 243, 164, 197,
  31, 109, 53, 180, 16, 138, 62, 68, 211, 163, 27, 90, 30, 47, 0, 2,
  157, 130, 80, 82, 133, 104, 203, 116, 39, 74, 194, 173, 188, 3, 248, 246,
  191, 64, 179, 107, 195, 96, 145, 120, 144, 6, 4, 226, 204, 9, 237, 132,
  167, 88, 239, 224, 11, 200, 43, 174, 181, 231, 81, 34, 42, 242, 201, 111,
  22, 57, 23, 12, 172, 103, 182, 98, 196, 134, 79, 102, 32, 106, 166, 190,
  238, 93, 220, 158, 115, 36, 247, 136, 105, 241, 245, 71, 7, 45, 208, 225,
  244, 160, 189, 15, 94, 199, 156, 1, 28, 218, 25, 141, 154, 210, 223, 5,
  153, 212, 187, 206, 142, 177, 10, 29, 147, 186, 222, 66, 193, 75, 61, 77,
  217, 84, 135, 73, 37, 85, 148, 162, 192, 202, 161, 209, 78, 219, 121, 205,
];

const LUT_3 = [
  23, 55, 7, 39, 151, 183, 135, 167, 87, 119, 71, 103, 215, 247, 199, 231,
  21, 53, 5, 37, 149, 181, 133, 165, 85, 117, 69, 101, 213, 245, 197, 229,
  22, 54, 6, 38, 150, 182, 134, 166, 86, 118, 70, 102, 214, 246, 198, 230,
  20, 52, 4, 36, 148, 180, 132, 164, 84, 116, 68, 100, 212, 244, 196, 228,
  31, 63, 15, 47, 159, 191, 143, 175, 95, 127, 79, 111, 223, 255, 207, 239,
  29, 61, 13, 45, 157, 189, 141, 173, 93, 125, 77, 109, 221, 253, 205, 237,
  30, 62, 14, 46, 158, 190, 142, 174, 94, 126, 78, 110, 222, 254, 206, 238,
  28, 60, 12, 44, 156, 188, 140, 172, 92, 124, 76, 108, 220, 252, 204, 236,
  19, 51, 3, 35, 147, 179, 131, 163, 83, 115, 67, 99, 211, 243, 195, 227,
  17, 49, 1, 33, 145, 177, 129, 161, 81, 113, 65, 97, 209, 241, 193, 225,
  18, 50, 2, 34, 146, 178, 130, 162, 82, 114, 66, 98, 210, 242, 194, 226,
  16, 48, 0, 32, 144, 176, 128, 160, 80, 112, 64, 96, 208, 240, 192, 224,
  27, 59, 11, 43, 155, 187, 139, 171, 91, 123, 75, 107, 219, 251, 203, 235,
  25, 57, 9, 41, 153, 185, 137, 169, 89, 121, 73, 105, 217, 249, 201, 233,
  26, 58, 10, 42, 154, 186, 138, 170, 90, 122, 74, 106, 218, 250, 202, 234,
  24, 56, 8, 40, 152, 184, 136, 168, 88, 120, 72, 104, 216, 248, 200, 232,
];

const LUT_4 = [
  28, 66, 58, 122, 98, 167, 169, 211, 213, 89, 149, 225, 208, 127, 88, 129,
  73, 94, 193, 203, 24, 6, 21, 17, 217, 49, 240, 220, 239, 69, 121, 114,
  78, 42, 4, 18, 226, 3, 202, 41, 106, 154, 180, 2, 34, 90, 52, 138,
  35, 142, 178, 198, 20, 136, 135, 82, 30, 124, 68, 235, 8, 197, 56, 83,
  215, 7, 179, 112, 144, 120, 162, 26, 70, 192, 156, 232, 43, 168, 248, 59,
  109, 47, 91, 54, 45, 183, 184, 237, 71, 166, 148, 181, 244, 221, 219, 27,
  46, 214, 51, 152, 253, 236, 177, 1, 33, 67, 157, 13, 190, 36, 194, 55,
  99, 251, 81, 128, 57, 93, 87, 165, 60, 118, 228, 29, 125, 86, 137, 92,
  242, 108, 84, 234, 131, 189, 201, 206, 110, 195, 147, 25, 250, 174, 116, 245,
  96, 182, 238, 243, 224, 126, 130, 100, 95, 246, 39, 216, 11, 139, 252, 62,
  176, 133, 23, 79, 115, 205, 10, 104, 16, 141, 40, 210, 170, 76, 186, 102,
  241, 111, 175, 249, 163, 5, 85, 64, 63, 227, 32, 200, 155, 14, 48, 153,
  207, 159, 77, 151, 158, 117, 229, 50, 0, 65, 123, 103, 15, 12, 31, 199,
  218, 185, 188, 209, 140, 230, 61, 132, 161, 72, 173, 105, 101, 146, 74, 19,
  145, 119, 150, 113, 172, 191, 160, 212, 134, 107, 9, 223, 247, 222, 171, 80,
  143, 233, 255, 204, 53, 37, 38, 254, 22, 196, 231, 44, 75, 187, 97, 164,
];

const LUT_5 = [
  167, 40, 252, 162, 251, 123, 239, 85, 73, 121, 93, 13, 5, 224, 236, 255,
  179, 231, 20, 45, 122, 183, 15, 152, 62, 27, 0, 74, 35, 55, 120, 6,
  36, 232, 198, 197, 82, 229, 32, 16, 173, 9, 61, 29, 90, 31, 52, 212,
  51, 175, 111, 170, 248, 33, 196, 97, 63, 83, 159, 28, 142, 75, 125, 41,
  180, 130, 101, 210, 139, 24, 91, 21, 194, 147, 56, 134, 226, 46, 247, 49,
  17, 109, 240, 246, 192, 99, 201, 164, 48, 100, 108, 178, 92, 118, 209, 218,
  225, 78, 216, 153, 1, 132, 181, 103, 107, 188, 129, 157, 195, 151, 116, 230,
  191, 193, 110, 71, 190, 2, 135, 233, 200, 161, 53, 138, 253, 84, 223, 98,
  131, 241, 228, 12, 3, 39, 4, 59, 203, 213, 43, 154, 37, 94, 79, 214,
  136, 10, 72, 222, 249, 141, 215, 105, 14, 77, 250, 113, 204, 217, 163, 150,
  104, 208, 65, 89, 205, 177, 227, 124, 23, 106, 34, 148, 95, 69, 221, 58,
  115, 243, 8, 160, 30, 25, 235, 140, 26, 169, 189, 182, 50, 119, 47, 199,
  145, 128, 158, 133, 220, 102, 54, 237, 176, 96, 66, 202, 18, 60, 42, 234,
  155, 86, 149, 126, 87, 146, 114, 57, 127, 88, 143, 156, 244, 211, 165, 137,
  117, 186, 207, 76, 185, 19, 254, 184, 187, 38, 144, 219, 64, 81, 112, 245,
  68, 206, 172, 171, 70, 11, 166, 174, 242, 7, 238, 44, 67, 168, 80, 22,
];

const LUT_6 = [
  203, 231, 198, 200, 144, 42, 224, 106, 75, 165, 109, 178, 201, 211, 163, 76,
  59, 60, 143, 156, 250, 157, 236, 125, 228, 33, 205, 118, 176, 87, 207, 191,
  192, 216, 43, 120, 66, 139, 199, 23, 161, 111, 90, 26, 218, 244, 21, 222,
  32, 82, 212, 58, 9, 122, 97, 85, 148, 248, 105, 204, 145, 2, 229, 202,
  20, 180, 92, 70, 11, 173, 48, 252, 213, 100, 28, 54, 117, 168, 189, 150,
  138, 154, 18, 74, 227, 255, 142, 246, 1, 233, 115, 38, 102, 158, 175, 137,
  86, 88, 169, 127, 72, 251, 37, 15, 14, 68, 133, 190, 116, 188, 96, 240,
  119, 8, 91, 232, 241, 208, 56, 235, 29, 151, 177, 57, 239, 101, 108, 81,
  179, 47, 112, 113, 230, 30, 196, 214, 107, 155, 80, 67, 194, 185, 140, 35,
  31, 99, 242, 77, 210, 160, 206, 254, 217, 247, 195, 226, 5, 3, 121, 123,
  22, 186, 243, 174, 220, 12, 238, 34, 153, 51, 103, 170, 172, 73, 197, 136,
  17, 132, 27, 215, 71, 193, 166, 245, 39, 146, 182, 41, 128, 152, 134, 159,
  16, 253, 164, 44, 49, 36, 124, 40, 167, 19, 219, 221, 130, 114, 131, 93,
  181, 69, 13, 98, 55, 63, 149, 89, 10, 223, 234, 83, 62, 110, 94, 104,
  209, 50, 95, 0, 225, 24, 78, 249, 162, 53, 25, 187, 64, 61, 7, 84,
  46, 45, 65, 141, 129, 237, 171, 147, 6, 183, 4, 184, 52, 79, 126, 135,
];

export function decodeCn1623DamageParameters(input: Uint8Array): number[] {
  if (input.length < 4) throw new RangeError('packet 840 payload header is truncated');
  let cursor = 4;
  const parameters: number[] = [];
  {
    const selector = bitsLE(input, 25, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 3:
      case 4:
        if (cursor + 1 > input.length) throw new RangeError('packet 840 field field_0x10 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = input[start + 0];
        }
        break;
      case 2:
        value = 255;
        break;
      case 5:
        value = 1;
        break;
      case 6:
        value = 0;
        break;
      case 7:
        value = 2;
        break;
      default: throw new RangeError('packet 840 field 0 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 18, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 2:
      case 7:
        if (cursor + 4 > input.length) throw new RangeError('packet 840 field field_0x14 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_0[input[start + 0]]) | ((LUT_0[input[start + 1]]) << 8) | ((LUT_0[input[start + 2]]) << 16) | ((LUT_0[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 3:
        value = 0;
        break;
      case 4:
        value = 1073741824;
        break;
      case 5:
        value = 1065353216;
        break;
      case 6:
        value = 3212836864;
        break;
      default: throw new RangeError('packet 840 field 1 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 3, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 3:
      case 5:
      case 6:
        if (cursor + 1 > input.length) throw new RangeError('packet 840 field field_0x18 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = LUT_1[input[start + 0]];
        }
        break;
      case 1:
        value = 0;
        break;
      case 2:
        value = 255;
        break;
      case 4:
        value = 2;
        break;
      case 7:
        value = 1;
        break;
      default: throw new RangeError('packet 840 field 2 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 6, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 2:
      case 5:
      case 6:
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 840 field field_0x1c has a truncated varuint32');
            decodedByte = LUT_3[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 0;
        break;
      case 4:
        value = 4294967295;
        break;
      default: throw new RangeError('packet 840 field 3 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 9, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
      case 2:
      case 4:
      case 5:
      case 6:
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 840 field field_0x20 has a truncated varuint32');
            decodedByte = LUT_4[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 4294967295;
        break;
      default: throw new RangeError('packet 840 field 4 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 24, 1);
    let value: number;
    switch (selector) {
      case 0:
        value = 0;
        break;
      case 1:
        value = 1;
        break;
      default: throw new RangeError('packet 840 field 5 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 0, 3);
    let value: number;
    switch (selector) {
      case 0:
        value = 2;
        break;
      case 1:
        value = 0;
        break;
      case 2:
      case 3:
      case 5:
      case 7:
        if (cursor + 1 > input.length) throw new RangeError('packet 840 field field_0x25 is truncated');
        {
          const start = cursor;
          cursor += 1;
          value = input[start + 0];
        }
        break;
      case 4:
        value = 255;
        break;
      case 6:
        value = 1;
        break;
      default: throw new RangeError('packet 840 field 6 selector is outside the recovered domain');
    }
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 21, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 2:
      case 5:
      case 6:
      case 7:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 840 field field_0x28 has a truncated varuint32');
            decodedByte = LUT_5[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
        }
        if ((value & 0x00ffffff) !== 0) value = (value ^ 0x40000000) >>> 0;
        break;
      case 3:
        value = 0;
        break;
      case 4:
        value = 4294967295;
        break;
      default: throw new RangeError('packet 840 field 7 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 15, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 3:
      case 6:
        value = 0;
        {
          let shift = 0;
          let bytesRead = 0;
          let decodedByte;
          do {
            if (cursor >= input.length) throw new RangeError('packet 840 field field_0x2c has a truncated varuint32');
            decodedByte = LUT_6[input[cursor++]];
            value = (value | ((decodedByte & 127) << shift)) >>> 0;
            shift += 7;
            bytesRead += 1;
          } while ((decodedByte & 128) !== 0 && bytesRead < 5);
        }
        break;
      case 2:
        value = 1;
        break;
      case 4:
        value = 2;
        break;
      case 5:
        value = 4294967295;
        break;
      case 7:
        value = 0;
        break;
      default: throw new RangeError('packet 840 field 8 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  {
    const selector = bitsLE(input, 12, 3);
    let value: number;
    switch (selector) {
      case 0:
      case 1:
      case 5:
      case 6:
        if (cursor + 4 > input.length) throw new RangeError('packet 840 field field_0x30 is truncated');
        {
          const start = cursor;
          cursor += 4;
          value = ((LUT_2[input[start + 0]]) | ((LUT_2[input[start + 1]]) << 8) | ((LUT_2[input[start + 2]]) << 16) | ((LUT_2[input[start + 3]]) << 24)) >>> 0;
        }
        break;
      case 2:
        value = 0;
        break;
      case 3:
        value = 3212836864;
        break;
      case 4:
        value = 1073741824;
        break;
      case 7:
        value = 1065353216;
        break;
      default: throw new RangeError('packet 840 field 9 selector is outside the recovered domain');
    }
    value = value >>> 0;
    parameters.push(value);
  }
  if (cursor !== input.length) throw new RangeError('packet 840 has an unexpected payload tail');
  return parameters;
}
