const opfsSyncWorkerSource = `
const OPFS_TIMESTAMPS_FILE = '.emscripten-opfs-stats';
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const rootDirectoryCache = new Map();

function splitPath(path) {
  if (!path) return [];
  return path.split('/').filter((p) => p.length > 0);
}

async function openSyncAccessHandleCompat(fileHandle) {
  try {
    return await fileHandle.createSyncAccessHandle();
  } catch (e) {
    if (e && e.name === 'NoModificationAllowedError') {
      console.warn("openSyncAccessHandleCompat NoModificationAllowedError, retrying");
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          openSyncAccessHandleCompat(fileHandle).then(resolve).catch(reject);
        }, 100);
      });
    } else {
      console.error("openSyncAccessHandleCompat error", e);
      throw e;
    }
  }
}

async function getRootDirectory(root, updateMeta) {
  const key = root || '';
  const cached = rootDirectoryCache.get(key);
  if (cached && updateMeta !== true) {
    return cached;
  }

  let dir;
  if (cached) {
    dir = cached.dir;
  } else {
    dir = await navigator.storage.getDirectory();
    for (const part of splitPath(key)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
  }

  let meta;
  let accessHandle;
  try {
    const fileHandle = await dir.getFileHandle(OPFS_TIMESTAMPS_FILE, { create: false });
    accessHandle = await openSyncAccessHandleCompat(fileHandle);
    const fileSize = accessHandle.getSize();
    if (fileSize > 0) {
      const buffer = new Uint8Array(fileSize);
      accessHandle.read(buffer, { at: 0 });
      meta = JSON.parse(textDecoder.decode(buffer));
    }
  } catch (e) {
    // ignore
  } finally {
    if (accessHandle) {
      accessHandle.close();
    }
  }

  if (!meta || !meta.nodes) {
    meta = { nodes: {} };
  }

  rootDirectoryCache.set(key, {
    dir,
    meta,
  });

  return rootDirectoryCache.get(key);
}

function updateMeta(root, anyPath, timestamp, mode, isDir, length) {
  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;
  const cached = rootDirectoryCache.get(root);
  if (!cached) {
    throw new Error('root "' + root + '" directory not found');
  }
  cached.meta.nodes[path] = cached.meta.nodes[path] || {};
  cached.meta.nodes[path].t = timestamp.getTime();
  cached.meta.nodes[path].m = mode;
  cached.meta.nodes[path].d = isDir;
  cached.meta.nodes[path].l = length;
}

function getMeta(root, anyPath) {
  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;
  const cached = rootDirectoryCache.get(root);
  if (!cached) {
    throw new Error('root "' + root + '" directory not found');
  }
  const meta = cached.meta.nodes[path];
  return meta ? { timestamp: new Date(meta.t), mode: meta.m, isDir: meta.d, length: meta.l } : null;
}

function removeMeta(root, anyPath) {
  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;
  const cached = rootDirectoryCache.get(root);
  if (!cached) {
    throw new Error('root "' + root + '" directory not found');
  }
  delete cached.meta.nodes[path];
}

async function flushMeta(root) {
  const cached = rootDirectoryCache.get(root);
  if (!cached) {
    throw new Error('root "' + root + '" directory not found');
  }
  if (Object.keys(cached.meta.nodes).length === 0) {
    try {
      await cached.dir.removeEntry(OPFS_TIMESTAMPS_FILE);
    } catch(e) {
      // ignore
    }
  } else {
    const fileHandle = await cached.dir.getFileHandle(OPFS_TIMESTAMPS_FILE, { create: true });
    const accessHandle = await openSyncAccessHandleCompat(fileHandle);
    accessHandle.truncate(0);
    accessHandle.write(textEncoder.encode(JSON.stringify(cached.meta)));
    accessHandle.flush();
    accessHandle.close();
  }
}

async function getDirectory(root, path, create) {
  const rootDir = (await getRootDirectory(root)).dir;
  const parts = typeof path === 'string' ? splitPath(path) : path;
  let dir = rootDir;
  for (let i = 0; i < parts.length; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create });
  }
  return dir;
}

async function getParentDirectory(root, path, create) {
  const parts = splitPath(path)
  const dir = await getDirectory(root, parts.slice(0, -1), create);
  return { dir, name: parts[parts.length - 1] };
}

async function openHandle(root, path, create) {
  const { dir, name } = await getParentDirectory(root, path, create);
  const fileHandle = await dir.getFileHandle(name, { create });
  return await openSyncAccessHandleCompat(fileHandle);
}

function readFromHandle(accessHandle, offset, length) {
  const size = accessHandle.getSize();
  if (!length) {
    length = size;
  }
  if (offset + length > size) {
    length = size - offset;
  }
  if (length < 0) {
    length = 0;
  }
  const contents = new Uint8Array(length);
  const read = accessHandle.read(contents, { at: offset });
  return { contents, read };
}

function writeToHandle(accessHandle, offset, data, timestamp, mode, fileSize) {
  if (offset > accessHandle.getSize()) {
    accessHandle.truncate(offset);
  }
  const written = accessHandle.write(data, { at: offset });
  if (typeof fileSize === 'number' && accessHandle.getSize() > fileSize) {
    accessHandle.truncate(fileSize);
  }
  return written;
}

function postSuccess(type, requestId, result, transferable) {
  self.postMessage({ type, requestId, ok: true, result }, transferable);
}

function postError(type, requestId, error) {
  self.postMessage({
    type,
    requestId,
    ok: false,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
    },
  });
}

const onmessage = async (event) => {
  const { type, payload = {}, requestId } = event.data || {};

  let cachedHandle = null;
  let cachedHandlePath = null;

  function updateCachedHandle(accessHandle, path) {
    if (accessHandle !== cachedHandle && cachedHandle !== null) {
      cachedHandle.close();
    }
    cachedHandle = accessHandle;
    cachedHandlePath = path;
  }

  function closeCachedHandle() {
    if (cachedHandle !== null) {
      cachedHandle.close();
      cachedHandle = null;
      cachedHandlePath = null;
    }
  }

  function write(root, path, offset, contents, timestamp, mode, fileSize, syncCall = false, useHandleCache  = false) {
    const isDir = (mode & 0o170000) === 0o040000;
    if (!isDir) { // file
      const data = contents ?? new Uint8Array(0);
      if (syncCall) {
        if (cachedHandlePath === root + path) {
          const written = writeToHandle(cachedHandle, offset, data, timestamp, mode, fileSize);
          updateMeta(root, path, timestamp, mode, false, cachedHandle.getSize());
          return written;
        } else {
          return null;
        }
      }

      return openHandle(root, path, true).then((accessHandle) => {
        const written = writeToHandle(accessHandle, offset, data, timestamp, mode, fileSize);
        updateMeta(root, path, timestamp, mode, false, accessHandle.getSize());
        if (useHandleCache) {
          updateCachedHandle(accessHandle, root + path);
        } else {
          accessHandle.close();
        }
        return written;
      });
    } else {
      updateMeta(root, path, timestamp, mode, true, 0);
      return getDirectory(root, path, true).then(() => 0);
    }
  }

  function read(root, path, offset, length, syncCall = false, updateHandleCache = false) {
    if (syncCall) {
      if (cachedHandlePath === root + path) {
        return readFromHandle(cachedHandle, offset, length);
      } else {
        return null;
      }
    }

    return openHandle(root, path, false).then((accessHandle) => {
      const result = readFromHandle(accessHandle, offset, length);
      if (updateHandleCache) {
        updateCachedHandle(accessHandle, root + path);
      } else {
        accessHandle.close();
      }
      return result;
    });
  }

  try {
    switch (type) {
      case 'pwrite': {
        const { root, parts, timestamp, mode } = payload;
        parts.sort();
        let written = 0;
        for (const { path, offset, contents, fileSize } of parts) {
          let result = write(root, path, offset, contents, timestamp, mode, fileSize, true);
          if (result === null) {
            result = await write(root, path, offset, contents, timestamp, mode, fileSize, false, true);
          }
          written += result;
        }
        closeCachedHandle();
        postSuccess(type, requestId, { written });
      } break;
      case 'write': {
        const { root, path, offset = 0, contents = null, timestamp, mode, fileSize } = payload;
        const written = await write(root, path, offset, contents, timestamp, mode, fileSize);
        postSuccess(type, requestId, { written });
      } break;
      case 'pread': {
        const { root, groups } = payload;
        const contents = [];
        for (const parts  of groups) {
          let totalLength = 0;
          const partsContent = [];
          for (const { path, offset, length } of parts) {
            let result = read(root, path, offset, length, true);
            if (result === null) {
              result = await read(root, path, offset, length, false, true);
            }
            partsContent.push(result.contents);
            totalLength += result.contents.length;
          }
          if (partsContent.length === 1) {
            contents.push(partsContent[0]);
          } else {
            const content = new Uint8Array(totalLength);
            let offset = 0;
            for (const part of partsContent) {
              content.set(part, offset);
              offset += part.length;
            }
            contents.push(content);
          }
        }
        closeCachedHandle();
        postSuccess(type, requestId, { contents }, contents.map((c) => c.buffer));
      } break;
      case 'read': {
        let length = payload.length;
        const { root, path, offset = 0 } = payload;
        const { timestamp, mode } = getMeta(root, path);
        const result = await read(root, path, offset, length);
        postSuccess(type, requestId, { ...result, timestamp, mode }, [result.contents.buffer]);
      } break;
      case 'unlink': {
        const { root, path } = payload;
        const paths = Array.isArray(path) ? path : [path];
        for (const path of paths) {
          removeMeta(root, path);
          const { dir, name } = await getParentDirectory(root, path, false);
          await dir.removeEntry(name);
        }
        postSuccess(type, requestId, { deleted: true });
      } break;
      case 'list': {
        const { root } = payload;
        const { dir: rootDir, meta } = await getRootDirectory(root, true);
        const entries = {};
        let metaChanged = false;

        function ensureParentDirsInMeta(path, timestampMs) {
          const parts = splitPath(path);
          if (parts.length < 2) {
            return;
          }

          const safeTimestamp = typeof timestampMs === 'number' ? timestampMs : Date.now();
          for (let i = 1; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join('/');
            if (!meta.nodes[parentPath]) {
              meta.nodes[parentPath] = {
                t: safeTimestamp,
                m: 0o040755,
                d: true,
                l: 0,
              };
              metaChanged = true;
            }
          }
        }

        async function walk(dir, prefix) {
          for await (const [name, handle] of dir.entries()) {
            const path = prefix ? prefix + '/' + name : name;
            if (handle.kind === 'directory') {
              await walk(handle, path);
            } else if (handle.kind === 'file') {
              const fileMeta = getMeta(root, path);
              if (fileMeta) {
                if (fileMeta.isDir) {
                  // Recover from stale metadata that marked this file path as a directory.
                  let fileSize = typeof fileMeta.length === 'number' ? fileMeta.length : 0;
                  try {
                    const file = await handle.getFile();
                    fileSize = file.size;
                  } catch (e) {
                    console.warn('Failed to read OPFS file size during metadata recovery for "' + path + '"', e);
                  }
                  fileMeta.isDir = false;
                  fileMeta.mode = (fileMeta.mode & ~0o170000) | 0o100000;
                  fileMeta.length = fileSize;
                  if (meta.nodes[path]) {
                    meta.nodes[path].d = false;
                    meta.nodes[path].m = fileMeta.mode;
                    meta.nodes[path].l = fileSize;
                  }
                  metaChanged = true;
                }
                ensureParentDirsInMeta(path, fileMeta.timestamp.getTime());
                entries[root + '/' + path] = fileMeta;
              }
            }
          }
        }

        await walk(rootDir, '');

        for (const [path, node] of Object.entries(meta.nodes)) {
          if (node.d && !entries[root + '/' + path]) {
            entries[root + '/' + path] = { timestamp: new Date(node.t), mode: node.m, isDir: node.d, length: 0 };
          }
        }
        if (metaChanged) {
          await flushMeta(root);
        }
        postSuccess(type, requestId, entries);
      } break;
      case 'flush': {
        const { root } = payload;
        await flushMeta(root);
        postSuccess(type, requestId, { flushed: true });
      } break;
      default:
        throw new Error('unknown OPFS worker message type: ' + type);
    }
  } catch (error) {
    postError(type, requestId, error);
  }
};
self.onmessage = (event) => onmessage(event).catch(console.error);
`;

function getOpfsWorker() {
    if (globalThis.opfsWorker) {
        return globalThis.opfsWorker;
    }

    const opfsSyncWorkerUrl = URL.createObjectURL(new Blob([opfsSyncWorkerSource], { type: "text/javascript" }));
	const worker = new Worker(opfsSyncWorkerUrl);
    worker.requestId = 0;
    globalThis.opfsWorker = worker;
    return globalThis.opfsWorker;
}

function callWorker(
    type,
    payload,
    callback,
    transfer
) {
    const worker = getOpfsWorker();
    if (!worker) {
        return callback(new Error("OPFS worker not initialized"));
    }

    const selfId = worker.requestId++;
    const handler = (event) => {
        const { requestId, ok, result, error } = event.data;
        if (requestId === selfId) {
            worker.removeEventListener("message", handler);
            if (ok) {
                callback(null, result);
            } else {
                callback(new Error(error.message));
            }
        }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type, payload, requestId: selfId }, transfer);
}

export function opfsRead(
    root,
    path,
    offset,
    length
) {
    return new Promise((resolve, reject) => {
        callWorker("read", { root, path, offset, length }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

export function opfsWrite(root, path, offset, contents, fileSize) {
    return new Promise((resolve, reject) => {
        callWorker(
            "write",
            { root, path, offset, contents, fileSize, timestamp: new Date(), mode: 0o100666 },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.written);
                }
            },
            [contents.buffer]
        );
    });
}

export function opfsWriteParts(root, parts) {
    return new Promise((resolve, reject) => {
        callWorker(
            "pwrite",
            { root, parts, timestamp: new Date(), mode: 0o100666 },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.written);
                }
            },
            [...parts.map((p) => p.contents?.buffer).filter((b) => b !== undefined)]
        );
    });
}

export function opfsReadParts(root, groups) {
    return new Promise((resolve, reject) => {
        callWorker("pread", { root, groups }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result.contents);
            }
        });
    });
}

export function opfsList(root) {
    return new Promise((resolve, reject) => {
        callWorker("list", { root }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

export function opfsUnlink(root, path) {
    return new Promise((resolve, reject) => {
        callWorker("unlink", { root, path }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

export function opfsFlush(root) {
    return new Promise((resolve, reject) => {
        callWorker("flush", { root }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}
