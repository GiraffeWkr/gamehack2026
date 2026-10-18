"""Minimal UnityFS bundle reader.

Enough of the format to pull the asset payload out of an Addressables bundle:
the header is big-endian, the blocks info is compressed with the same codec as
the data blocks (0 none / 1 LZMA / 2 LZ4 / 3 LZ4HC), and each block carries its
own compressed and uncompressed size.
"""
import struct, sys, io, os

try:
    import lz4.block as lz4b
except ImportError:
    sys.exit('need lz4:  python -m pip install lz4')


def cstr(b, p):
    e = b.index(b'\0', p)
    return b[p:e].decode('utf8', 'replace'), e + 1


def decompress(kind, data, out_size):
    if kind == 0:
        return data
    if kind in (2, 3):
        return lz4b.decompress(data, uncompressed_size=out_size)
    if kind == 1:
        import lzma
        return lzma.decompress(data)          # Unity uses raw LZMA; may need a
    raise ValueError('unknown compression %d' % kind)   # 13-byte header shim


def read_bundle(path):
    raw = open(path, 'rb').read()
    p = 0
    sig, p = cstr(raw, p)
    assert sig == 'UnityFS', sig
    (version,) = struct.unpack_from('>I', raw, p); p += 4
    unity_ver, p = cstr(raw, p)
    unity_rev, p = cstr(raw, p)
    (total,) = struct.unpack_from('>q', raw, p); p += 8
    (ci_size,) = struct.unpack_from('>I', raw, p); p += 4
    (cu_size,) = struct.unpack_from('>I', raw, p); p += 4
    (flags,) = struct.unpack_from('>I', raw, p); p += 4
    kind = flags & 0x3F
    print('UnityFS v%d  engine %s  size=%d  blocksInfo %d->%d  flags=0x%x (codec %d)'
          % (version, unity_rev, total, ci_size, cu_size, flags, kind))

    ci = decompress(kind, raw[p:p + ci_size], cu_size)
    p += ci_size
    q = 16                                    # skip the 16-byte hash
    (nblocks,) = struct.unpack_from('>I', ci, q); q += 4
    blocks = []
    for _ in range(nblocks):
        u, c, f = struct.unpack_from('>IIH', ci, q); q += 10
        blocks.append((u, c, f))
    (nnodes,) = struct.unpack_from('>I', ci, q); q += 4
    nodes = []
    for _ in range(nnodes):
        off, size, nf = struct.unpack_from('>qqI', ci, q); q += 20
        nm, q = cstr(ci, q)
        nodes.append((off, size, nf, nm))

    print('\n%d blocks, %d nodes' % (nblocks, nnodes))
    for off, size, nf, nm in nodes:
        print('   node %-60s size=%d' % (nm, size))

    out = bytearray()
    for u, c, f in blocks:
        k = f & 0x3F
        out += decompress(k, raw[p:p + c], u)
        p += c
    return bytes(out), nodes


if __name__ == '__main__':
    data, nodes = read_bundle(sys.argv[1])
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       'bundle_payload.bin')
    open(out, 'wb').write(data)
    print('\nwrote %d bytes -> %s' % (len(data), out))
