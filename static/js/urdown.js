var OPPOSITE_DIR = 'ltr'
var UILANGS = [
    { label: 'اُردو', value: 'urdu' },
    { label: 'English', value: 'english' }
]
var STORAGE_KEY = 'urdown_data'
var SETTINGS_KEY = 'urdown_settings'
var MAX_HISTORY = 200
var AUTOSAVE_DELAY = 500
var HISTORY_DB_DELAY = 30000

/* Showdown Extensions */
var oppositeBlock = function () {
    var myext1 = { type: 'lang', regex: /[\n\r]+?[,|،]{3}([\s\S]+?)[\n\r]+[,|،]{3}[\s]+?/gm, replace: '%ENGBLOCKSTART%\n$1\n%ENGBLOCKEND%' }
    var myext2 = { type: 'output', regex: /\\([,|،]{3})/gm, replace: '$1' }
    var myext3 = {
        type: 'output',
        regex: /%ENGBLOCKSTART%([\s\S]+?)%ENGBLOCKEND%/gm,
        replace: function (m, c) { return '\n<div dir="' + OPPOSITE_DIR + '" class="opp_dir_div ' + OPPOSITE_DIR + '_div">' + c + '</div>\n' }
    }
    return [myext1, myext2, myext3]
}
var hugoWiki = function () {
    var myext1 = { type: 'lang', regex: /{{%\s*rtl\s*%}}([\s\S]+?){{%\s*\\rtl\s*%}}/gm, replace: '%RTLBLOCKSTART%\n$1\n%RTLBLOCKEND%' }
    var myext2 = { type: 'lang', regex: /{{%\s*ltr\s*%}}([\s\S]+?){{%\s*\\ltr\s*%}}/gm, replace: '%LTRBLOCKSTART%\n$1\n%LTRBLOCKEND%' }
    var myext3 = { type: 'output', regex: /%RTLBLOCKSTART%([\s\S]+?)%RTLBLOCKEND%/gm, replace: function (m, c) { return '\n<div dir="rtl" class="rtl">' + c + '</div>\n' } }
    var myext4 = { type: 'output', regex: /%LTRBLOCKSTART%([\s\S]+?)%LTRBLOCKEND%/gm, replace: function (m, c) { return '\n<div dir="ltr" class="ltr">' + c + '</div>\n' } }
    return [myext1, myext2, myext3, myext4]
}
showdown.extension('oppositeblock', oppositeBlock)
showdown.extension('hugowiki', hugoWiki)

/* Angular App */
var urdown = angular.module('Urdown', ['ng-showdown', 'ngSanitize'])
urdown.config(function ($showdownProvider) {
    $showdownProvider.setOption('simpleLineBreaks', true)
    $showdownProvider.setOption('emoji', true)
    $showdownProvider.setOption('tasklists', true)
    $showdownProvider.setOption('tables', true)
    $showdownProvider.setOption('strikethrough', true)
    $showdownProvider.setOption('ghCodeBlocks', true)
    $showdownProvider.setOption('openLinksInNewWindow', true)
    $showdownProvider.loadExtension('oppositeblock')
    $showdownProvider.loadExtension('hugowiki')
})

/* Directives */
urdown.directive('ngScroll', function () {
    return { restrict: 'A', link: function (s, e, a) { e.on('scroll', function () { var fn = s.$eval(a.ngScroll); if (typeof fn === 'function') s.$apply(fn) }); s.$on('$destroy', function () { e.off('scroll') }) } }
})
urdown.directive('ngEnter', function () {
    return { restrict: 'A', link: function (s, e, a) { e.on('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { s.$apply(function () { s.$eval(a.ngEnter) }) } }); s.$on('$destroy', function () { e.off('keydown') }) } }
})
urdown.directive('ngResize', function ($window) {
    return { restrict: 'A', link: function (s, e, a) { angular.element($window).on('resize', function () { s.$apply(function () { s.$eval(a.ngResize) }) }); s.$on('$destroy', function () { angular.element($window).off('resize') }) } }
})

/* Main Controller */
urdown.controller('urdownCtrl', function ($scope, $http, $location, $window, $timeout, $showdown) {

    /* State */
    $scope.rawText = ''
    $scope.theme = 'day'
    $scope.themeToggle = false
    $scope.editMode = true
    $scope.defaultDir = 'rtl'
    $scope.oppDir = 'ltr'
    $scope.saved = true
    $scope.focusMode = false
    $scope.showSearch = false
    $scope.showHistory = false
    $scope.showSettings = false
    $scope.showShortcuts = false
    $scope.showHelp = false
    $scope.showOpen = false
    $scope.showHTML = false
    $scope.showOppDir = false
    $scope.showAbout = false
    $scope.mobileToolbar = false
    $scope.searchQuery = ''
    $scope.searchMatches = []
    $scope.searchIndex = -1
    $scope.fileName = ''
    $scope.outHTML = ''
    $scope.oppDirText = ''
    $scope.promptInput = ''
    $scope.toast = { show: false, message: '', type: 'info' }
    $scope.resizeActive = false
    $scope.editorPercent = 50
    $scope.scrolled = false
    $scope.syncingScroll = false
    $scope.uiLangs = UILANGS
    $scope.uiLang = $scope.uiLangs[0]
    $scope.ui = null
    $scope.helpContent = ''
    $scope.historyList = []
    $scope.historyLoading = false
    $scope.historySearch = ''
    $scope.historyStats = { totalVersions: 0 }
    $scope.selectedVersion = null
    $scope.showVersionDiffBool = false
    $scope.versionDiffContent = ''

    /* Undo/Redo */
    var editHistory = []
    var editPos = -1
    var skipPush = false

    /* Timers */
    var saveTimer = null
    var dbTimer = null

    /* Settings defaults */
    $scope.settings = {
        fontSize: 16, lineHeight: 1.7, autoSave: true, wordWrap: true,
        lineNumbers: true, scrollSync: true, autoPreview: true,
        fontFamily: 'Calibri, Corbel, Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        urduFont: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif'
    }

    /* ======== HISTORY ======== */
    $scope.pushHistory = function () {
        if (skipPush) return
        editPos++
        editHistory = editHistory.slice(0, editPos)
        editHistory.push($scope.rawText)
        if (editHistory.length > MAX_HISTORY) { editHistory.shift(); editPos-- }
        $scope.saved = false
    }
    $scope.undo = function () {
        if (editPos <= 0) return; skipPush = true; editPos--
        $scope.rawText = editHistory[editPos]; $scope.onChange(); skipPush = false
    }
    $scope.redo = function () {
        if (editPos >= editHistory.length - 1) return; skipPush = true; editPos++
        $scope.rawText = editHistory[editPos]; $scope.onChange(); skipPush = false
    }
    $scope.resetHistory = function () { editHistory = [$scope.rawText || '']; editPos = 0 }

    /* ======== TEXT CHANGE ======== */
    $scope.onChange = function () {
        $scope.saved = false
        $scope.pushHistory()
        $scope.updateStats()
        if ($scope.settings.autoSave) {
            if (saveTimer) $timeout.cancel(saveTimer)
            saveTimer = $timeout(function () { $scope.autoSave() }, AUTOSAVE_DELAY)
        }
        if (dbTimer) $timeout.cancel(dbTimer)
        dbTimer = $timeout(function () { $scope.saveToIndexedDB() }, HISTORY_DB_DELAY)
    }

    /* ======== STATS ======== */
    $scope.stats = { words: 0, chars: 0, charsNoSpace: 0, lines: 0, paragraphs: 0, readingTime: '0s', headings: 0, links: 0 }
    $scope.updateStats = function () {
        var t = $scope.rawText || ''
        $scope.stats.chars = t.length
        $scope.stats.charsNoSpace = t.replace(/\s/g, '').length
        $scope.stats.words = t.trim() ? t.trim().split(/\s+/).length : 0
        $scope.stats.lines = t ? t.split('\n').length : 0
        $scope.stats.paragraphs = t ? t.split(/\n\s*\n/).filter(function (p) { return p.trim() }).length : 0
        var wpm = 200, mins = $scope.stats.words / wpm
        if (mins < 1) $scope.stats.readingTime = Math.ceil(mins * 60) + 's'
        else if (mins < 60) $scope.stats.readingTime = Math.ceil(mins) + 'm'
        else $scope.stats.readingTime = Math.floor(mins / 60) + 'h ' + Math.ceil(mins % 60) + 'm'
        var h = 0, lk = 0
        t.split('\n').forEach(function (ln) { var s = ln.trim(); if (/^#{1,6}\s/.test(s)) h++; if (/\[.*?\]\(.*?\)/.test(s)) lk++ })
        $scope.stats.headings = h; $scope.stats.links = lk
    }

    /* ======== LINE NUMBERS ======== */
    $scope.lineNumArray = []
    $scope.updateLineNums = function () {
        var c = ($scope.rawText || '').split('\n').length
        if (!$scope.lineNumArray || $scope.lineNumArray.length !== c) $scope.lineNumArray = new Array(c)
    }

    /* ======== AUTO SAVE ======== */
    $scope.autoSave = function () {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: $scope.rawText, dir: $scope.defaultDir, theme: $scope.theme, fileName: $scope.fileName, saved: Date.now() })); $scope.saved = true } catch (e) { }
    }
    $scope.saveSettings = function () {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify($scope.settings)) } catch (e) { }
    }

    /* ======== INDEXEDDB HISTORY ======== */
    $scope.saveToIndexedDB = function () {
        if (!$scope.rawText) return
        UrdownDB.save({
            content: $scope.rawText, title: $scope.fileName || 'Untitled',
            wordCount: $scope.stats.words, charCount: $scope.stats.chars,
            direction: $scope.defaultDir, theme: $scope.theme
        }, function (err) { if (err) console.log('DB save error:', err) })
    }
    $scope.loadHistory = function () {
        $scope.historyLoading = true
        if ($scope.historySearch) {
            UrdownDB.search($scope.historySearch, function (err, data) { $scope.historyLoading = false; if (!err) $scope.historyList = data || [] })
        } else {
            UrdownDB.getAll(100, 0, function (err, data) { $scope.historyLoading = false; if (!err) $scope.historyList = data || [] })
        }
    }
    $scope.loadFromHistory = function (entry) {
        if (!entry) return
        $scope.rawText = entry.content
        $scope.fileName = entry.title
        $scope.defaultDir = entry.direction || 'rtl'
        if (entry.theme) { $scope.theme = entry.theme; $scope.themeToggle = entry.theme === 'night' }
        $scope.resetHistory()
        $scope.showHistory = false
        $scope.showToast('Version loaded: ' + new Date(entry.timestamp).toLocaleString(), 'success')
    }
    $scope.deleteHistoryEntry = function (id, $event) {
        $event.stopPropagation()
        UrdownDB.deleteById(id, function () { $scope.loadHistory() })
    }
    $scope.clearAllHistory = function () {
        if (!confirm('Delete all history?')) return
        UrdownDB.clearAll(function () { $scope.historyList = []; $scope.loadHistory() })
    }
    $scope.exportBackup = function () {
        UrdownDB.exportBackup(function (err, data) {
            if (err) { $scope.showToast('Export failed', 'error'); return }
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            saveAs(blob, 'urdown-backup-' + new Date().toISOString().slice(0, 10) + '.json')
            $scope.showToast('Backup exported (' + data.count + ' versions)', 'success')
        })
    }
    $scope.importBackup = function () {
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = function (e) {
            var file = e.target.files[0]
            if (!file) return
            var reader = new FileReader()
            reader.onload = function (ev) {
                try {
                    var data = JSON.parse(ev.target.result)
                    UrdownDB.importBackup(data, function (err, count) {
                        if (err) { $scope.$apply(function () { $scope.showToast('Import failed: ' + err.message, 'error') }); return }
                        $scope.$apply(function () { $scope.showToast('Imported ' + count + ' versions', 'success'); $scope.loadHistory() })
                    })
                } catch (e) { $scope.$apply(function () { $scope.showToast('Invalid backup file', 'error') }) }
            }
            reader.readAsText(file)
        }
        input.click()
    }
    $scope.viewVersionDiff = function (entry) {
        $scope.selectedVersion = entry
        $scope.versionDiffContent = entry.content
        $scope.showVersionDiffBool = true
    }

    /* ======== TOOLBAR / FORMATTING ======== */
    function wrap(b, a) {
        var ta = document.getElementById('raw_text'); if (!ta) return
        var s = ta.selectionStart, e = ta.selectionEnd, t = $scope.rawText
        var sel = t.substring(s, e) || ''
        $scope.rawText = t.substring(0, s) + b + sel + a + t.substring(e)
        $scope.pushHistory(); $scope.onChange()
        $timeout(function () { ta.focus(); ta.selectionStart = s + b.length; ta.selectionEnd = s + b.length + sel.length })
    }
    function ins(t) {
        var ta = document.getElementById('raw_text'); if (!ta) return
        var s = ta.selectionStart, e = ta.selectionEnd
        $scope.rawText = $scope.rawText.substring(0, s) + t + $scope.rawText.substring(e)
        $scope.pushHistory(); $scope.onChange()
        $timeout(function () { ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length })
    }
    function linePref(p) {
        var ta = document.getElementById('raw_text'); if (!ta) return
        var s = ta.selectionStart, t = $scope.rawText
        var ls = t.lastIndexOf('\n', s - 1) + 1
        $scope.rawText = t.substring(0, ls) + p + t.substring(ls)
        $scope.pushHistory(); $scope.onChange()
        $timeout(function () { ta.focus(); ta.selectionStart = ta.selectionEnd = s + p.length })
    }
    $scope.fmt = {
        bold: function () { wrap('**', '**') },
        italic: function () { wrap('*', '*') },
        strike: function () { wrap('~~', '~~') },
        h1: function () { linePref('# ') },
        h2: function () { linePref('## ') },
        h3: function () { linePref('### ') },
        ul: function () { linePref('- ') },
        ol: function () { linePref('1. ') },
        task: function () { linePref('- [ ] ') },
        quote: function () { linePref('> ') },
        code: function () { wrap('```\n', '\n```') },
        icode: function () { wrap('`', '`') },
        link: function () { wrap('[', '](url)') },
        img: function () { wrap('![', '](url)') },
        table: function () { ins('\n| Header | Header |\n| ------ | ------ |\n| Cell | Cell |\n') },
        hr: function () { ins('\n---\n') }
    }

    /* ======== SEARCH ======== */
    $scope.toggleSearch = function () {
        $scope.showSearch = !$scope.showSearch
        if (!$scope.showSearch) { $scope.searchQuery = ''; $scope.searchMatches = []; $scope.searchIndex = -1 }
        if ($scope.showSearch) $timeout(function () { var el = document.getElementById('searchInput'); if (el) el.focus() })
    }
    $scope.doSearch = function () {
        if (!$scope.searchQuery) { $scope.searchMatches = []; $scope.searchIndex = -1; return }
        var t = $scope.rawText || '', q = $scope.searchQuery.toLowerCase(), m = [], i = 0
        while (true) { var p = t.toLowerCase().indexOf(q, i); if (p === -1) break; m.push(p); i = p + 1 }
        $scope.searchMatches = m; $scope.searchIndex = m.length > 0 ? 0 : -1; $scope.highlightSearch()
    }
    $scope.searchNext = function () {
        if (!$scope.searchMatches.length) return
        $scope.searchIndex = ($scope.searchIndex + 1) % $scope.searchMatches.length
        $scope.highlightSearch()
    }
    $scope.searchPrev = function () {
        if (!$scope.searchMatches.length) return
        $scope.searchIndex = ($scope.searchIndex - 1 + $scope.searchMatches.length) % $scope.searchMatches.length
        $scope.highlightSearch()
    }
    $scope.searchKeydown = function ($event) {
        if ($event.key === 'Enter') { $event.shiftKey ? $scope.searchPrev() : $scope.searchNext() }
        else if ($event.key === 'Escape') { $scope.toggleSearch() }
    }
    $scope.highlightSearch = function () {
        var ta = document.getElementById('raw_text'); if (!ta || $scope.searchIndex < 0) return
        var p = $scope.searchMatches[$scope.searchIndex]
        ta.focus(); ta.selectionStart = p; ta.selectionEnd = p + $scope.searchQuery.length
    }

    /* ======== FILE OPS ======== */
    $scope.newDoc = function () {
        if ($scope.rawText && !$scope.saved && !confirm('Discard unsaved changes?')) return
        $scope.rawText = ''; $scope.fileName = ''; $scope.resetHistory(); $scope.showToast('New document', 'info')
    }
    $scope.openHandler = function () { $scope.showOpen = !$scope.showOpen; if ($scope.showOpen) $scope.promptInput = ''; $scope.showHTML = false; $scope.showOppDir = false }
    $scope.saveFile = function () {
        var b = new Blob([$scope.rawText], { type: 'text/plain;charset=utf-8' })
        saveAs(b, ($scope.fileName || 'urdown').replace(/\.[^.]+$/, '') + '.md')
        $scope.saved = true; $scope.showToast('File saved', 'success')
    }
    $scope.showBars = true
    $scope.toggleBars = function () {
        $scope.showBars = !$scope.showBars
        try { localStorage.setItem('urdown_bars', JSON.stringify($scope.showBars)) } catch (e) {}
    }
    $scope.exportPDF = function () {
        var out = document.getElementById('output_outer')
        if (!out || !out.innerHTML.trim()) { $scope.showToast('Nothing to export', 'error'); return }
        var css = ''
        var links = document.querySelectorAll('link[rel="stylesheet"]')
        for (var i = 0; i < links.length; i++) css += links[i].outerHTML
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + css + '<style>body{margin:0 auto;padding:0;max-width:210mm}@page{margin:15mm}#output_inner{font-size:12pt}</style></head><body>' + out.innerHTML + '</body></html>'
        var w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        w.document.title = ($scope.fileName || 'urdown') + '-print'
        w.onload = function () { w.focus(); w.print() }
    }
    $scope.downloadPDF = function () {
        if (typeof html2pdf === 'undefined') { $scope.showToast('PDF export not available', 'error'); return }
        var el = document.getElementById('output_outer')
        if (!el || !el.innerHTML.trim()) { $scope.showToast('Nothing to export', 'error'); return }
        var opt = {
            margin: 10, filename: ($scope.fileName || 'urdown').replace(/\.[^.]+$/, '') + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: 'avoid-all' }
        }
        html2pdf().set(opt).from(el).save().then(function () {
            $scope.$apply(function () { $scope.showToast('PDF downloaded', 'success') })
        }).catch(function () {
            $scope.$apply(function () { $scope.showToast('PDF export failed', 'error') })
        })
    }
    $scope.isFullscreen = false
    $scope.toggleFullscreen = function () {
        if (!document.fullscreenElement) {
            var el = document.documentElement
            if (el.requestFullscreen) el.requestFullscreen()
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
            else if (el.msRequestFullscreen) el.msRequestFullscreen()
        } else {
            if (document.exitFullscreen) document.exitFullscreen()
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
            else if (document.msExitFullscreen) document.msExitFullscreen()
        }
    }
    $scope.exportImage = function () {
        if (typeof html2canvas === 'undefined' && typeof html2pdf === 'undefined') { $scope.showToast('Image export not available', 'error'); return }
        var el = document.getElementById('output_outer') || document.getElementById('output_inner')
        if (!el || !el.innerHTML.trim()) { $scope.showToast('Nothing to export', 'error'); return }
        document.fonts.ready.then(function () {
            var h2c = typeof html2canvas !== 'undefined' ? html2canvas : (html2pdf && html2pdf.html2canvas ? html2pdf.html2canvas : null)
            if (!h2c) { $scope.$apply(function () { $scope.showToast('Image export not available', 'error') }); return }
            h2c(el, { scale: 2, useCORS: true, logging: false, allowTaint: true, backgroundColor: '#ffffff' }).then(function (canvas) {
                canvas.toBlob(function (blob) {
                    saveAs(blob, ($scope.fileName || 'urdown').replace(/\.[^.]+$/, '') + '-preview.png')
                    $scope.$apply(function () { $scope.showToast('Image exported', 'success') })
                })
            }).catch(function () { $scope.$apply(function () { $scope.showToast('Image export failed', 'error') }) })
        })
    }
    $scope.showHTMLPanel = function () {
        $scope.showHTML = !$scope.showHTML; $scope.showOpen = false; $scope.showOppDir = false
        if ($scope.showHTML) $scope.genHTML()
    }
    $scope.genHTML = function () {
        var out = document.getElementById('output_outer').innerHTML
        $http.get('./static/css/output.css').then(function (r) { $scope.outHTML = '<div dir="' + $scope.defaultDir + '"><style>' + r.data + '</style>' + out + '</div>' }, function () { $scope.outHTML = '<div dir="' + $scope.defaultDir + '">' + out + '</div>' })
    }
    $scope.copyHTML = function () { copyText($scope.outHTML); $scope.showToast('HTML copied', 'success') }
    $scope.copyPreview = function () {
        var el = document.getElementById('output_inner'); if (el) { copyText(el.innerHTML); $scope.showToast('Preview copied', 'success') }
    }
    function copyText(t) {
        if (navigator.clipboard) navigator.clipboard.writeText(t)
        else { var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    }
    $scope.readMarkdown = function () {
        var r = new FileReader()
        r.onload = function (e) { $scope.$apply(function () { $scope.rawText = r.result; $scope.fileName = document.getElementById('fileinput').files[0].name; $scope.showOpen = false; $scope.resetHistory(); $scope.showToast('File loaded', 'success') }) }
        r.onerror = function () { $scope.$apply(function () { $scope.showToast('Error reading file', 'error') }) }
        var f = document.getElementById('fileinput').files[0]; if (f) r.readAsText(f)
    }
    $scope.loadFromURL = function () {
        if (!$scope.promptInput) return
        $http.get($scope.promptInput).then(function (r) { $scope.rawText = r.data; $scope.fileName = $scope.promptInput.split('/').pop() || ''; $scope.showOpen = false; $scope.resetHistory(); $scope.showToast('File loaded from URL', 'success') }, function () { $scope.showToast('Could not load URL', 'error') })
    }

    /* ======== OPPOSITE DIR ======== */
    $scope.toggleOppDir = function () {
        $scope.showOppDir = !$scope.showOppDir; $scope.showOpen = false; $scope.showHTML = false
        if ($scope.showOppDir) {
            var ta = document.getElementById('raw_text')
            if (ta) $scope.oppDirText = $scope.rawText.slice(ta.selectionStart, ta.selectionEnd)
            $timeout(function () { var el = document.getElementById('opp_input'); if (el) el.focus() })
        }
    }
    $scope.insertOppDir = function () {
        var ta = document.getElementById('raw_text'), s = ta ? ta.selectionStart : 0, e = ta ? ta.selectionEnd : 0
        $scope.rawText = $scope.rawText.slice(0, s) + '\n,,,\n' + $scope.oppDirText + '\n,,,\n' + $scope.rawText.slice(e)
        $scope.oppDirText = ''; $scope.showOppDir = false; $scope.pushHistory(); $scope.onChange(); $scope.focus('raw_text')
    }

    /* ======== NIGHT MODE ======== */
    $scope.toggleTheme = function () { $scope.theme = $scope.themeToggle ? 'night' : 'day'; $scope.saveSettings() }

    /* ======== DIRECTION ======== */
    $scope.swapDir = function () {
        var divs = document.querySelectorAll('#output_inner .opp_dir_div')
        for (var i = 0; i < divs.length; i++) divs[i].setAttribute('dir', $scope.defaultDir)
        if ($scope.defaultDir === 'rtl') { $scope.defaultDir = 'ltr'; OPPOSITE_DIR = 'rtl' } else { $scope.defaultDir = 'rtl'; OPPOSITE_DIR = 'ltr' }
        $scope.oppDir = OPPOSITE_DIR; document.documentElement.dir = $scope.defaultDir
        document.body.dir = $scope.defaultDir; $scope.saveSettings()
    }

    /* ======== TOAST ======== */
    $scope.showToast = function (msg, type) {
        type = type || 'info'; $scope.toast.message = msg; $scope.toast.type = type; $scope.toast.show = true
        $timeout(function () { $scope.toast.show = false }, 3000)
    }

    /* ======== FOCUS ======== */
    $scope.focus = function (id) { $timeout(function () { var el = document.getElementById(id); if (el) el.focus() }) }

    /* ======== SCROLL SYNC ======== */
    $scope.onEditorScroll = function () {
        if (!$scope.settings.scrollSync || $scope.syncingScroll) return; $scope.syncingScroll = true
        var ta = document.getElementById('raw_text'), pr = document.getElementById('output_outer')
        if (ta && pr && ta.scrollHeight > ta.clientHeight) {
            pr.scrollTop = (ta.scrollTop / (ta.scrollHeight - ta.clientHeight)) * (pr.scrollHeight - pr.clientHeight)
        }
        $timeout(function () { $scope.syncingScroll = false }, 50)
    }
    $scope.onPreviewScroll = function () {
        if (!$scope.settings.scrollSync || $scope.syncingScroll) return; $scope.syncingScroll = true
        var ta = document.getElementById('raw_text'), pr = document.getElementById('output_outer')
        if (ta && pr && pr.scrollHeight > pr.clientHeight) {
            ta.scrollTop = (pr.scrollTop / (pr.scrollHeight - pr.clientHeight)) * (ta.scrollHeight - ta.clientHeight)
        }
        $timeout(function () { $scope.syncingScroll = false }, 50)
    }

    /* ======== SETTINGS ======== */
    $scope.applySettings = function () {
        $scope.editorStyle = { fontSize: $scope.settings.fontSize + 'px', lineHeight: $scope.settings.lineHeight }
        $scope.saveSettings()
    }
    $scope.adjFontSize = function (d) { $scope.settings.fontSize = Math.max(10, Math.min(32, $scope.settings.fontSize + d)); $scope.applySettings() }
    $scope.adjLineH = function (d) { $scope.settings.lineHeight = Math.round(Math.max(1.0, Math.min(3.0, $scope.settings.lineHeight + d)) * 10) / 10; $scope.applySettings() }

    /* ======== SPLITTER ======== */
    $scope.splitterPos = '50%'
    $scope.splitterStyle = function () {
        var s = {}; s[$scope.defaultDir === 'rtl' ? 'right' : 'left'] = $scope.splitterPos; return s
    }
    $scope.resizeStart = function (e) {
        e.preventDefault()
        var pane = document.getElementById('editor-pane')
        if (!pane) return
        function onMove(ev) {
            if (!pane) return
            var rect = pane.getBoundingClientRect()
            var pct = ((ev.clientX - rect.left) / rect.width) * 100
            if ($scope.defaultDir === 'rtl') pct = 100 - pct
            pct = Math.max(20, Math.min(80, pct))
            $scope.$apply(function () { $scope.splitterPos = pct + '%' })
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            try { localStorage.setItem('urdown_splitter', $scope.splitterPos) } catch (e) {}
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    /* ======== SHORTCUTS ======== */
    $scope.shortcutList = [
        { key: 'Ctrl+S', label: 'Save' }, { key: 'Ctrl+O', label: 'Open' }, { key: 'Ctrl+N', label: 'New' },
        { key: 'Ctrl+Z', label: 'Undo' }, { key: 'Ctrl+Shift+Z', label: 'Redo' },
        { key: 'Ctrl+F', label: 'Search' }, { key: 'Ctrl+H', label: 'HTML' }, { key: 'Ctrl+E', label: 'Toggle Edit' },
        { key: 'Ctrl+D', label: 'Toggle Night' }, { key: 'Ctrl+,', label: 'Opposite Dir' },
        { key: 'Ctrl+P', label: 'Export PDF' }, { key: 'F11', label: 'Focus Mode' },
        { key: 'Escape', label: 'Close panel' }, { key: '?', label: 'Shortcuts' }
    ]

    /* ======== KEYBOARD ======== */
    $scope.keyHandler = function (e) {
        var k = e.key, c = e.keyCode || e.which, ctrl = e.ctrlKey || e.metaKey
        if (ctrl) {
            switch ((k || String.fromCharCode(c)).toLowerCase()) {
                case 's': e.preventDefault(); $scope.saveFile(); return
                case 'o': e.preventDefault(); $scope.openHandler(); return
                case 'n': e.preventDefault(); $scope.newDoc(); return
                case 'z': e.preventDefault(); e.shiftKey ? $scope.redo() : $scope.undo(); return
                case 'f': e.preventDefault(); $scope.toggleSearch(); return
                case 'h': e.preventDefault(); $scope.showHTMLPanel(); return
                case 'e': e.preventDefault(); $scope.editMode = !$scope.editMode; return
                case 'd': e.preventDefault(); $scope.themeToggle = !$scope.themeToggle; $scope.toggleTheme(); return
                case ',': case '،': e.preventDefault(); $scope.toggleOppDir(); return
                case 'p': e.preventDefault(); $scope.exportPDF(); return
            }
        }
        if (k === 'Escape' || c === 27) {
            if ($scope.showSearch) { $scope.toggleSearch(); return }
            if ($scope.showHistory) { $scope.showHistory = false; return }
            if ($scope.showSettings) { $scope.showSettings = false; return }
            if ($scope.showShortcuts) { $scope.showShortcuts = false; return }
            if ($scope.showOpen) { $scope.showOpen = false; return }
            if ($scope.showHTML) { $scope.showHTML = false; return }
            if ($scope.showOppDir) { $scope.showOppDir = false; return }
            if ($scope.showAbout) { $scope.showAbout = false; return }
            if ($scope.showVersionDiffBool) { $scope.showVersionDiffBool = false; return }
        }
        if (k === 'F11' || c === 122) { e.preventDefault(); $scope.focusMode = !$scope.focusMode; document.body.classList.toggle('focus-mode', $scope.focusMode); return }
        if (k === '?' && !ctrl && !e.altKey) { var t = e.target.tagName; if (t !== 'INPUT' && t !== 'TEXTAREA') { e.preventDefault(); $scope.showShortcuts = !$scope.showShortcuts } }
    }

    /* ======== UI ======== */
    $scope.loadUI = function () {
        $http.get('./static/ui/' + $scope.uiLang.value + '.json').then(function (r) { $scope.ui = r.data; if ($scope.ui && $scope.ui.helpLink) $scope.loadHelp($scope.ui.helpLink) }, function () { })
    }
    $scope.loadHelp = function (link) {
        var m = link.match(/src=([^&]+)/); var src = m ? decodeURIComponent(m[1]) : null
        if (src) $http.get(src).then(function (r) { $scope.helpContent = r.data }, function () { $scope.helpContent = '# Markdown Help\n\nSee [docs](https://github.com/yasinULLAH/Urdown).' })
    }

    /* ======== LOAD SAVED ======== */
    $scope.loadSavedData = function () {
        try {
            var d = JSON.parse(localStorage.getItem(STORAGE_KEY))
            if (d && d.text && !$location.search().src) { $scope.rawText = d.text; if (d.dir) $scope.defaultDir = d.dir; if (d.theme) { $scope.theme = d.theme; $scope.themeToggle = d.theme === 'night' }; if (d.fileName) $scope.fileName = d.fileName; $scope.saved = true }
            var s = JSON.parse(localStorage.getItem(SETTINGS_KEY))
            if (s) { for (var k in s) { if ($scope.settings.hasOwnProperty(k)) $scope.settings[k] = s[k] } }
            var sp = localStorage.getItem('urdown_splitter')
            if (sp) $scope.splitterPos = sp
            var bs = localStorage.getItem('urdown_bars')
            if (bs !== null) $scope.showBars = JSON.parse(bs)
        } catch (e) { }
        $scope.applySettings(); $scope.updateStats(); $scope.updateLineNums(); $scope.resetHistory()
    }

    /* ======== LOAD FROM URL PARAMS ======== */
    $scope.loadFromParams = function () {
        var s = $location.search()
        if (s.src) {
            $http.get(s.src).then(function (r) { $scope.rawText = r.data; $scope.resetHistory() }, function () { })
        }
        if (s.nightMode !== undefined) { $scope.themeToggle = s.nightMode === 'true'; $scope.theme = $scope.themeToggle ? 'night' : 'day' }
        if (s.editMode !== undefined) $scope.editMode = s.editMode === 'true'
        if (s.dir !== undefined && $scope.defaultDir !== s.dir) $scope.swapDir()
    }

    /* ======== DRAG DROP ======== */
    function setupDragDrop() {
        var app = document.getElementById('app'); if (!app) return
        app.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); app.classList.add('dragover') })
        app.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); app.classList.remove('dragover') })
        app.addEventListener('drop', function (e) {
            e.preventDefault(); e.stopPropagation(); app.classList.remove('dragover')
            var f = e.dataTransfer.files[0]; if (!f) return
            var r = new FileReader(); r.onload = function (ev) { $scope.$apply(function () { $scope.rawText = r.result; $scope.fileName = f.name; $scope.resetHistory(); $scope.showToast('File loaded', 'success') }) }; r.readAsText(f)
        })
    }

    /* ======== HISTORY STATS ======== */
    $scope.refreshHistoryStats = function () {
        UrdownDB.getStats(function (err, s) { if (!err) $scope.historyStats = s })
    }

    /* ======== INIT ======== */
    $scope.init = function () {
        $scope.loadSavedData(); $scope.loadFromParams()
        setupDragDrop()
        var app = document.getElementById('app'); if (app) app.setAttribute('data-drag-label', 'Drop file here')
        UrdownDB.open(function () { $scope.refreshHistoryStats() })
        $scope.$watch(function () { return $location.search() }, function () { if ($location.search().src) $scope.loadFromParams() }, true)
        $scope.$watch('rawText', function (n, o) { if (n !== o) { $scope.updateStats(); $scope.updateLineNums() } })
        angular.element($window).on('scroll', function () { $scope.scrolled = window.pageYOffset > 0; $scope.$apply() })
        angular.element($window).on('fullscreenchange webkitfullscreenchange mozfullscreenchange MSFullscreenChange', function () { $scope.$apply(function () { $scope.isFullscreen = !!document.fullscreenElement }) })
        document.documentElement.dir = $scope.defaultDir; document.body.dir = $scope.defaultDir
        $http.get('./static/placeholder.txt').then(function (r) { $scope.placeholder = r.data })
        $scope.showToast('Welcome to Urdown', 'info')
    }
})
