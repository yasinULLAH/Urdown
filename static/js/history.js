/* UrdownDB - IndexedDB History Engine */
var UrdownDB = (function () {
    var DB_NAME = 'UrdownHistory'
    var DB_VERSION = 1
    var db = null

    function open(callback) {
        if (db) { if (callback) callback(null); return }
        var req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = function (e) {
            var d = e.target.result
            if (!d.objectStoreNames.contains('versions')) {
                var store = d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true })
                store.createIndex('timestamp', 'timestamp', { unique: false })
                store.createIndex('title', 'title', { unique: false })
                store.createIndex('wordCount', 'wordCount', { unique: false })
            }
        }
        req.onsuccess = function (e) {
            db = e.target.result
            if (callback) callback(null)
        }
        req.onerror = function (e) {
            if (callback) callback(e.target.error)
        }
    }

    function save(data, callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readwrite')
            var store = tx.objectStore('versions')
            var entry = {
                timestamp: Date.now(),
                content: data.content || '',
                title: data.title || 'Untitled',
                wordCount: data.wordCount || 0,
                charCount: data.charCount || 0,
                direction: data.direction || 'rtl',
                theme: data.theme || 'day'
            }
            var req = store.add(entry)
            req.onsuccess = function () { if (callback) callback(null, req.result) }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function getAll(limit, offset, callback) {
        if (typeof limit === 'function') { callback = limit; limit = 50; offset = 0 }
        if (typeof offset === 'function') { callback = offset; offset = 0 }
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readonly')
            var store = tx.objectStore('versions')
            var index = store.index('timestamp')
            var req = index.openCursor(null, 'prev')
            var results = []
            var skipped = 0
            req.onsuccess = function (e) {
                var cursor = e.target.result
                if (cursor) {
                    if (skipped < offset) { skipped++; cursor.continue(); return }
                    if (results.length < limit) {
                        results.push(cursor.value)
                        cursor.continue()
                    } else {
                        if (callback) callback(null, results)
                    }
                } else {
                    if (callback) callback(null, results)
                }
            }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function search(query, callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readonly')
            var store = tx.objectStore('versions')
            var req = store.openCursor()
            var results = []
            var q = query.toLowerCase()
            req.onsuccess = function (e) {
                var cursor = e.target.result
                if (cursor) {
                    var v = cursor.value
                    if (v.content.toLowerCase().indexOf(q) !== -1 ||
                        v.title.toLowerCase().indexOf(q) !== -1) {
                        results.push(v)
                    }
                    cursor.continue()
                } else {
                    results.sort(function (a, b) { return b.timestamp - a.timestamp })
                    if (callback) callback(null, results)
                }
            }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function getById(id, callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readonly')
            var store = tx.objectStore('versions')
            var req = store.get(Number(id))
            req.onsuccess = function () { if (callback) callback(null, req.result) }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function deleteById(id, callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readwrite')
            var store = tx.objectStore('versions')
            var req = store.delete(Number(id))
            req.onsuccess = function () { if (callback) callback(null) }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function clearAll(callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readwrite')
            var store = tx.objectStore('versions')
            var req = store.clear()
            req.onsuccess = function () { if (callback) callback(null) }
            req.onerror = function () { if (callback) callback(req.error) }
        })
    }

    function exportBackup(callback) {
        getAll(100000, 0, function (err, data) {
            if (err) { if (callback) callback(err); return }
            var backup = {
                version: 1,
                exportedAt: Date.now(),
                count: data.length,
                entries: data
            }
            if (callback) callback(null, backup)
        })
    }

    function importBackup(backup, callback) {
        if (!backup || !backup.entries || !backup.entries.length) {
            if (callback) callback(new Error('Invalid backup'))
            return
        }
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readwrite')
            var store = tx.objectStore('versions')
            var count = 0
            tx.oncomplete = function () { if (callback) callback(null, count) }
            backup.entries.forEach(function (entry) {
                var data = {
                    timestamp: entry.timestamp || Date.now(),
                    content: entry.content || '',
                    title: entry.title || 'Untitled',
                    wordCount: entry.wordCount || 0,
                    charCount: entry.charCount || 0,
                    direction: entry.direction || 'rtl',
                    theme: entry.theme || 'day'
                }
                var req = store.add(data)
                req.onsuccess = function () { count++ }
            })
        })
    }

    function getStats(callback) {
        open(function (err) {
            if (err) { if (callback) callback(err); return }
            var tx = db.transaction('versions', 'readonly')
            var store = tx.objectStore('versions')
            var countReq = store.count()
            countReq.onsuccess = function () {
                if (callback) callback(null, { totalVersions: countReq.result })
            }
            countReq.onerror = function () { if (callback) callback(req.error) }
        })
    }

    return {
        open: open,
        save: save,
        getAll: getAll,
        search: search,
        getById: getById,
        deleteById: deleteById,
        clearAll: clearAll,
        exportBackup: exportBackup,
        importBackup: importBackup,
        getStats: getStats
    }
})()
