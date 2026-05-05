/**
 * @license
 * Copyright 2023 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

if (WASMFS) {
  addToLibrary({
    $OPFS__deps: ['wasmfs_create_opfs_backend'],
    $OPFS: {
      createBackend(opts) {
        return _wasmfs_create_opfs_backend();
      }
    },
  });
} else {
  addToLibrary({
    $OPFS__deps: ['$FS', '$MEMFS', '$PATH'],
    $OPFS__postset: () => {
      addAtExit('OPFS.quit();');
      return '';
    },
    $OPFS: {
      syncfsQueue: new Map(),
      getWorker: () => {
        if (globalThis.opfsWorker) {
          return globalThis.opfsWorker;
        }

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
        let allDeleted = true;
        for (const path of paths) {
          removeMeta(root, path);
          try {
            const { dir, name } = await getParentDirectory(root, path, false);
            await dir.removeEntry(name, { recursive: true });
          } catch (e) {
            if (!e || e.name !== 'NotFoundError') {
              allDeleted = false;
            }
          }
        }
        postSuccess(type, requestId, { deleted: allDeleted });
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
        OPFS.opfsSyncWorkerUrl = URL.createObjectURL(new Blob([opfsSyncWorkerSource], { type: 'text/javascript' }));
        globalThis.opfsWorker = new Worker(OPFS.opfsSyncWorkerUrl);
        globalThis.opfsWorker.requestId = 0;
        return globalThis.opfsWorker;
      },

      callWorker: (type, payload, callback) => {
        const worker = OPFS.getWorker();
        if (!worker) {
          return callback(new Error('OPFS worker not initialized'));
        }

        const selfId = worker.requestId++;
        const handler = (event) => {
          const { type, requestId, ok, result, error } = event.data;
          if (requestId === selfId) {
            worker.removeEventListener('message', handler);
            if (ok) {
              callback(null, result);
            } else {
              callback(new Error(error.message));
            }
          }
        };
        worker.addEventListener('message', handler);
        worker.postMessage({ type, payload, requestId: selfId });
      },

      // Queues a new VFS -> OPFS synchronization operation
      queuePersist: (mount) => {
        function onPersistComplete() {
          if (mount.opfsPersistState === 'again') startPersist(); // If a new sync request has appeared in between, kick off a new sync
          else mount.opfsPersistState = 0; // Otherwise reset sync state back to idle to wait for a new sync later
        }
        function startPersist() {
          mount.opfsPersistState = 'opfs'; // Mark that we are currently running a sync operation
          OPFS.syncfs(mount, /*populate:*/false, onPersistComplete);
        }

        if (!mount.opfsPersistState) {
          // Programs typically write/copy/move multiple files in the in-memory
          // filesystem within a single app frame, so when a filesystem sync
          // command is triggered, do not start it immediately, but only after
          // the current frame is finished. This way all the modified files
          // inside the main loop tick will be batched up to the same sync.
          mount.opfsPersistState = setTimeout(startPersist, 0);
        } else if (mount.opfsPersistState === 'opfs') {
          // There is an active OPFS sync operation in-flight, but we now
          // have accumulated more files to sync. We should therefore queue up
          // a new sync after the current one finishes so that all writes
          // will be properly persisted.
          mount.opfsPersistState = 'again';
        }
      },

      mount: (mount) => {
        if (!mount.opts?.root) {
          console.error('No root provided, root should be the path to the root of OPFS directory (with .emscripten-opfs-stats file)');
          console.error('Uset it like this: FS.mount(OPFS, { root: "..." }, "' + mount.mountpoint + '")');
          throw new Error('No root provided');
        }
        // reuse core MEMFS functionality
        var mnt = MEMFS.mount(mount);
        // If the automatic OPFS persistence option has been selected, then automatically persist
        // all modifications to the filesystem as they occur.
        if (mount?.opts?.autoPersist) {
          mount.opfsPersistState = 0; // IndexedDB sync starts in idle state
          var memfs_node_ops = mnt.node_ops;
          mnt.node_ops = { ...mnt.node_ops }; // Clone node_ops to inject write tracking
          mnt.node_ops.mknod = (parent, name, mode, dev) => {
            var node = memfs_node_ops.mknod(parent, name, mode, dev);
            // Propagate injected node_ops to the newly created child node
            node.node_ops = mnt.node_ops;
            // Remember for each OPFS node which OPFS mount point they came from so we know which mount to persist on modification.
            node.opfs_mount = mnt.mount;
            // Remember original MEMFS stream_ops for this node
            node.memfs_stream_ops = node.stream_ops;
            // Clone stream_ops to inject write tracking
            node.stream_ops = { ...node.stream_ops };

            // Track all file writes
            node.stream_ops.write = (stream, buffer, offset, length, position, canOwn) => {
              // This file has been modified, we must persist IndexedDB when this file closes
              stream.node.isModified = true;
              return node.memfs_stream_ops.write(stream, buffer, offset, length, position, canOwn);
            };

            // Persist OPFS on file close
            node.stream_ops.close = (stream) => {
              var n = stream.node;
              if (n.isModified) {
                OPFS.queuePersist(n.opfs_mount);
                n.isModified = false;
              }
              if (n.memfs_stream_ops.close) return n.memfs_stream_ops.close(stream);
            };

            // Persist the node we just created to OPFS
            OPFS.queuePersist(mnt.mount);

            return node;
          };
          // Also kick off persisting the filesystem on other operations that modify the filesystem.
          mnt.node_ops.rmdir = (...args) => (OPFS.queuePersist(mnt.mount), memfs_node_ops.rmdir(...args));
          mnt.node_ops.symlink = (...args) => (OPFS.queuePersist(mnt.mount), memfs_node_ops.symlink(...args));
          mnt.node_ops.unlink = (...args) => (OPFS.queuePersist(mnt.mount), memfs_node_ops.unlink(...args));
          mnt.node_ops.rename = (...args) => (OPFS.queuePersist(mnt.mount), memfs_node_ops.rename(...args));
        }

        OPFS.syncfsQueue.set(mount.mountpoint, { active: false, delayed: [] });
        return mnt;
      },

      syncFsIgnore: null,
      syncFsOnProgress: null,
      syncfs: (mount, populate, callback) => {
        const queue = OPFS.syncfsQueue.get(mount.mountpoint);
        if (queue.active) {
          queue.delayed.push({ populate, callback });
          return;
        }

        queue.active = true;
        OPFS.getLocalSet(mount, (err, local) => {
          if (err) return callback(err);

          OPFS.getRemoteSet(mount, (err, remote) => {
            if (err) return callback(err);

            var src = populate ? remote : local;
            var dst = populate ? local : remote;

            OPFS.reconcile(mount, src, dst, (err) => {
              queue.active = false;
              callback(err);
              if (!queue.active && queue.delayed.length > 0) {
                const { populate, callback } = queue.delayed.shift();
                OPFS.syncfs(mount, populate, callback);
              }
            });
          });
        });
      },
      getLocalSet: (mount, callback) => {
        var entries = {};

        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return (p) => PATH.join2(root, p);
        };

        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));

        while (check.length) {
          var path = check.pop();
          var stat;

          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }

          if (FS.isDir(stat.mode)) {
            check.push(...FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }

          entries[path] = { 'timestamp': stat.mtime };
        }

        return callback(null, { type: 'local', entries: entries });
      },
      getRemoteSet: (mount, callback) => {
        OPFS.callWorker('list', { root: mount.opts.root }, (err, entries) => {
          const normalized = {}
          for (const [path, entry] of Object.entries(entries)) {
            if (mount.opts.folder) {
              if (path.startsWith(mount.opts.folder)) {
                normalized[mount.mountpoint + path.substring(mount.opts.folder.length)] = {...entry, path };
              }
            } else {
              normalized[mount.mountpoint + path.substring(mount.opts.root.length)] = {...entry, path };
            }
          }
          callback(err, { type: 'remote', entries: normalized });
        });
      },
      loadLocalEntry: (path, callback) => {
        var stat, node;

        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }

        if (FS.isDir(stat.mode)) {
          return callback(null, { 'timestamp': stat.mtime, 'mode': stat.mode });
        } else if (FS.isFile(stat.mode)) {
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { 'timestamp': stat.mtime, 'mode': stat.mode, 'contents': node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },
      storeLocalEntry: (path, entry, callback) => {
        try {
          if (FS.isDir(entry['mode'])) {
            FS.mkdirTree(path, entry['mode']);
          } else if (FS.isFile(entry['mode'])) {
            FS.writeFile(path, entry['contents'], { canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }

          FS.chmod(path, entry['mode']);
          FS.utime(path, entry['timestamp'], entry['timestamp']);
        } catch (e) {
          return callback(e);
        }

        callback(null);
      },
      removeLocalEntry: (path, callback) => {
        try {
          var stat = FS.stat(path);

          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }

        callback(null);
      },
      loadRemoteEntry: (mount, path, callback) => {
        if (path.startsWith(mount.opts.root)) {
          OPFS.callWorker('read', {
            root: mount.opts.root,
            path: path.substring(mount.opts.root.length),
          }, callback);
        } else {
          callback(new Error('path is not in the mount point'));
        }
      },
      storeRemoteEntry: (mount, path, entry, callback) => {
        if (path.startsWith(mount.opts.root)) {
          OPFS.callWorker('write', {
            root: mount.opts.root,
            path: path.substring(mount.opts.root.length),
            contents: entry.contents,
            timestamp: entry.timestamp,
            mode: entry.mode,
            offset: 0,
            fileSize: entry.contents ? entry.contents.length : undefined,
          }, callback);
        } else {
          callback(new Error('path is not in the mount point'));
        }
      },
      removeRemoteEntry: (mount, path, callback) => {
        if (path.startsWith(mount.opts.root)) {
          OPFS.callWorker('unlink', {
            root: mount.opts.root,
            path: path.substring(mount.opts.root.length),
          }, callback);
        } else {
          callback(new Error('path is not in the mount point'));
        }
      },
      reconcile: (mount, src, dst, callback) => {
        var total = 0;

        var create = [];
        for (var [key, e] of Object.entries(src.entries)) {
          var e2 = dst.entries[key];
          if (!e2 || e['timestamp'].getTime() != e2['timestamp'].getTime()) {
            create.push(key);
            total++;
          }
        }

        var remove = [];
        for (var key of Object.keys(dst.entries)) {
          if (!src.entries[key]) {
            remove.push(key);
            total++;
          }
        }

        if (!total) {
          return callback(null);
        }

        const promise = (async () => {
          // sort paths in ascending order so directory entries are created
          // before the files inside them
          create.sort();

          let reportedProgress = 0;
          if (OPFS.syncFsOnProgress) {
            OPFS.syncFsOnProgress(0, dst.type, null);
          }
          const updateProgress = (path, i, total) => {
            let progress = Math.round(i * 100 / total);
            if (progress > reportedProgress) {
              reportedProgress = progress;
              if (OPFS.syncFsOnProgress) {
                OPFS.syncFsOnProgress(reportedProgress, dst.type, path);
              }
            }
          }

          let delayed = [];
          function flushDelayed() {
            const promise = Promise.all(delayed);
            delayed = [];
            return promise;
          }

          let created = 0;
          for (let i = 0; i < create.length; i++) {
            const path = create[i];
            if (!(src.entries[path]?.isDir || dst.entries[path]?.isDir) && OPFS.syncFsIgnore !== null && OPFS.syncFsIgnore(dst.type, 'create', path)) {
              continue;
            }
            delayed.push(new Promise((resolve, reject) => {
              if (dst.type === 'local') {
                const entry = src.entries[path];
                if (entry.isDir) {
                  OPFS.storeLocalEntry(path, entry, (e) => e ? reject(e) : resolve());
                } else {
                  OPFS.loadRemoteEntry(mount, entry.path, (err, entry) => {
                    if (err) return reject(err);
                    OPFS.storeLocalEntry(path, entry, (e) => e ? reject(e) : resolve());
                  });
                }
              } else {
                OPFS.loadLocalEntry(path, (err, entry) => {
                  if (err) return reject(err);
                  OPFS.storeRemoteEntry(mount,
                    path.startsWith(mount.opts.root) ? path : mount.opts.root + path,
                    entry, (e) => e ? reject(e) : resolve());
                });
              }
            }).then(() => {
              created += 1;
              updateProgress(path, created, create.length)
            }));
            if (delayed.length > 64) {
              await flushDelayed();
            }
          }
          await flushDelayed();

          // sort paths in descending order so files are deleted before their
          // parent directories
          for (var path of remove.sort().reverse()) {
            if (OPFS.syncFsIgnore !== null && OPFS.syncFsIgnore(dst.type, 'remove', path)) {
              continue;
            }

            delayed.push(new Promise((resolve, reject) => {
              if (dst.type === 'local') {
                OPFS.removeLocalEntry(path, (e) => e ? reject(e) : resolve());
              } else {
                if (mount.opts.root + path !== mount.opts.folder) {
                  OPFS.removeRemoteEntry(mount,
                    path.startsWith(mount.opts.root) ? path : mount.opts.root + path,
                    (e) => e ? reject(e) : resolve());
                } else {
                  resolve();
                }
              }
            }));
          }
          await flushDelayed();

          if (dst.type === 'remote') {
            await (new Promise((resolve, reject) => {
              OPFS.callWorker('flush', { root: mount.opts.root }, (e) => e ? reject(e) : resolve());
            }));
          }
        })();

        promise.then(() => {
          callback(null)
        });
        promise.catch((e) => {
          console.error('reconcile error', e);
          callback(e);
        });
      },
      quit: () => {
      },
      // high-level API
      opfsDirectoryCache: new Map(),
      opfsRead:(root, path, offset, length) => {
        return new Promise((resolve, reject) => {
          OPFS.callWorker("read", { root, path, offset, length }, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      },

      opfsWrite: async (root, path, offset, contents, fileSize) => {
        let cache = OPFS.opfsDirectoryCache.get(root);
        if (!cache) {
          cache = new Set();
          OPFS.opfsDirectoryCache.set(root, cache);
        }

        const dirname = path.substring(0, path.lastIndexOf('/'));
        if (dirname.length > 0 && !cache.has(dirname)) {
          await (new Promise((resolve, reject) => {
            OPFS.callWorker("write", { root, path: dirname, offset, timestamp: new Date(), mode: 0o040755 }, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
          }));
          cache.add(dirname);
        }

        return new Promise((resolve, reject) => {
          OPFS.callWorker("write", { root, path, offset, contents, fileSize, timestamp: new Date(), mode: 0o100666 }, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      },

      opfsList:(root) => {
        return new Promise((resolve, reject) => {
          OPFS.callWorker("list", { root }, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      },

      opfsUnlink:(root, path) => {
        return new Promise((resolve, reject) => {
          OPFS.callWorker("unlink", { root, path }, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      },

      opfsFlush:(root) => {
        return new Promise((resolve, reject) => {
          OPFS.callWorker("flush", { root }, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      },

      /* mode can be "directory", "files", "zip" */
      initOPFS:(mode, root) => {
        if (!mode) {
          console.log("No mode (directory, files, zip) provided, skipping OPFS initialization");
          return;
        }
        if (!root) {
          console.log("No root provided, skipping OPFS initialization");
          return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = mode === "directory";
        input.multiple = mode !== "zip";
        if (mode === "zip") {
          input.accept = ".zip";
        }

        input.onchange = async function (event) {
          try {
            const directory = root;
            const list = await OPFS.opfsList(directory);

            console.log("== Directory list", root);
            for (const [path, entry] of Object.entries(list)) {
              console.log("== Path", path, "size", entry.length ? (entry.length / 1024 / 1024).toFixed(2) + " MB" : "??? MB");
            }

            const inFiles = Array.from((event.target).files ?? []);
            const matched = [];

            if (mode === "zip") {
              if (inFiles.length != 1) {
                throw new Error("Only one file is allowed when uploading a ZIP");
              }
              const entries = (await unzipRaw(new BufferedBlobReader(inFiles[0]))).entries;
              for (const entry of entries) {
                if (!entry.isDirectory) {
                  matched.push({
                    arrayBuffer: () => {
                      return entry.arrayBuffer();
                    },
                    targetPath: entry.name,
                    size: entry.size
                  });
                }
              }
            } else {
              for (const file of inFiles) {
                const path = file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
                matched.push({
                  arrayBuffer: file.arrayBuffer.bind(file),
                  targetPath: path.startsWith(directory) ? path.substring(directory.length) : path,
                  size: file.size
                });
              }
            }

            let reportedProgress = 0;
            const total = matched.length;
            if (total > 0) {
              console.log("Uploading files");
              let size = 0;
              const totalSize = matched.reduce((sum, file) => sum + file.size, 0);
              const totalSizeStr = (totalSize / 1024 / 1024).toFixed(2) + " MB";
              for (let i = 0; i < total; i++) {
                const { arrayBuffer, targetPath } = matched[i];
                const data = new Uint8Array(await arrayBuffer());
                await OPFS.opfsWrite(directory, targetPath, 0, data, data.length);
                size += data.length;
                const sizeStr = (size / 1024 / 1024).toFixed(2) + " MB";
                let progress = Math.round(size * 100 / totalSize);
                if (progress > reportedProgress) {
                  reportedProgress = progress;
                  console.log("Uploading file", targetPath, "size", sizeStr, "total size", totalSizeStr, "progress", reportedProgress + "%");
                }
              }
            }

            await OPFS.opfsFlush(directory);

            console.log("Well done...");
          } catch (error) {
            console.error("Error uploading files", error);
          }
        };

        input.click();
      }
    }
  });
}
