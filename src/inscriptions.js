export const parseSignatureScript = (hex) => {
    /* Decodes inscriptions */
    /* KRC-20 tx deploy: 105424172e946f85daf87f50422e4a5a7f73d541a7a0eaf666cf40567a80ba5d */
    /* KRC-20 tx mint: e2792d606f7cae9994cbc233a2cdb9c4d4541ad195852ae8ecfd787254613ded */
    /* KRC-20 tx transfer: 657a7a3dbe5c6af4e49eba4c0cf82753f01d5e721f458d356f62bebd0afd54c8 */
    /* KRC-721 tx transfer: ec13b8e75a8e82a2e13fe41cd03cff770978dd52d09a8d3b79c66625a8e3cb08 */
    if (!hex) {
        return;
    }
    try {
        return parseSignature(hexToBytes(hex));
    } catch (error) {
        console.warn("Error parsing signature:", error);
        return null;
    }
}

function parseSignature(bytes) {
    let result = [];

    let offset = 0;
    while (offset < bytes.length) {
        const opcode = bytes[offset];
        offset += 1;
        if (opcode >= 0x01 && opcode <= 0x4b) {
            const dataLength = opcode;
            const data = bytes.slice(offset, offset + dataLength);
            if (isHumanReadable(data)) {
                result.push(['OP_PUSH', bytesToString(data)]);
            } else {
                result.push(['OP_PUSH', bytesToHex(data)]);
            }
            offset += dataLength;
        } else if (opcode === 0x4c) {
            const dataLength = bytes[offset];
            offset += 1;
            const data = bytes.slice(offset, offset + dataLength);
            if (isHumanReadable(data)) {
                result.push(['OP_PUSHDATA1', bytesToString(data)]);
            } else {
                result = result.concat(parseSignature(data));
            }
            offset += dataLength;
        } else if (opcode === 0x00) {
            result.push(['OP_0'])
        } else if (opcode === 0x51) {
            result.push(['OP_1'])
        } else if (opcode === 0x63) {
            result.push(['OP_IF'])
        } else if (opcode === 0x68) {
            result.push(['OP_ENDIF'])
        } else if (opcode === 0xac) {
            result.push(['OP_CHECKSIG'])
        } else {
            result.push(['OP_UNKNOWN', bytesToHex(opcode)])
        }
    }
    return result;
}

const hexToBytes = (hex) => {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
};

function isHumanReadable(bytes) {
    return bytes.every(byte => byte >= 0x20 && byte <= 0x7E);
}

const bytesToHex = (bytes) => {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const bytesToString = (bytes) => {
    return new TextDecoder().decode(bytes);
}
