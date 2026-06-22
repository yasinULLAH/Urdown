var OPPOSITE_DIR = 'ltr'
var UILANGS = [
    {'label': 'اُردو', 'value': 'urdu'},
    {'label': 'English', 'value': 'english'}
]
var STORAGE_KEY = 'urdown_data'
var SETTINGS_KEY = 'urdown_settings'
var MAX_HISTORY = 100
var DEBOUNCE_DELAY = 300

// Showdown extensions
var oppositeBlock = function () {
    var myext1 = {
        type: 'lang',
        regex: /[\n\r]+?[,|،]{3}([\s\S]+?)[\n\r]+[,|،]{3}[\s]+?/gm,
        replace: '%ENGBLOCKSTART%\n$1\n%ENGBLOCKEND%'
    }
    var myext2 = {
        type: 'output',
        regex: /\\([,|،]{3})/gm,
        replace: '$1'
    }
    var myext3 = {
        type: 'output',
        regex: /%ENGBLOCKSTART%([\s\S]+?)%ENGBLOCKEND%/gm,
        replace: function (match, capture) {
            return '\n<div dir="' + OPPOSITE_DIR + '" class="opp_dir_div ' + OPPOSITE_DIR + '_div">' + capture + '</div>\n'
        }
    }
    return [myext1, myext2, myext3]
}

var hugoWiki = function () {
    var myext1 = {
        type: 'lang',
        regex: /{{%\s*rtl\s*%}}([\s\S]+?){{%\s*\\rtl\s*%}}/gm,
        replace: '%RTLBLOCKSTART%\n$1\n%RTLBLOCKEND%'
    }
    var myext2 = {
        type: 'lang',
        regex: /{{%\s*ltr\s*%}}([\s\S]+?){{%\s*\\ltr\s*%}}/gm,
        replace: '%LTRBLOCKSTART%\n$1\n%LTRBLOCKEND%'
    }
    var myext3 = {
        type: 'output',
        regex: /%RTLBLOCKSTART%([\s\S]+?)%RTLBLOCKEND%/gm,
        replace: function (match, capture) {
            return '\n<div dir="rtl" class="rtl">' + capture + '</div>\n'
        }
    }
    var myext4 = {
        type: 'output',
        regex: /%LTRBLOCKSTART%([\s\S]+?)%LTRBLOCKEND%/gm,
        replace: function (match, capture) {
            return '\n<div dir="ltr" class="ltr">' + capture + '</div>\n'
        }
    }
    return [myext1, myext2, myext3, myext4]
}

showdown.extension('oppositeblock', oppositeBlock)
showdown.extension('hugowiki', hugoWiki)

// Angular app
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

urdown.directive('ngScroll', function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            element.on('scroll', function () {
                var fn = scope.$eval(attrs.ngScroll)
                if (typeof fn === 'function') {
                    scope.$apply(function () {
                        fn()
                    })
                }
            })
            scope.$on('$destroy', function () { element.off('scroll') })
        }
    }
})

urdown.directive('ngEnter', function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            element.on('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    scope.$apply(function () { scope.$eval(attrs.ngEnter) })
                }
            })
            scope.$on('$destroy', function () { element.off('keydown') })
        }
    }
})

urdown.controller('urdownConverter', function ($scope, $http, $location, $window, $showdown, $timeout) {
    // --- STATE ---
    $scope.rawText = ''
    $scope.theme = 'day'
    $scope.themeToggle = false
    $scope.editMode = true
    $scope.showOpenPrompt = false
    $scope.showHTMLPrompt = false
    $scope.showOppDirPrompt = false
    $scope.showShortcutsModal = false
    $scope.showHelpModal = false
    $scope.showSearch = false
    $scope.showSearchReplace = false
    $scope.sidebarOpen = false
    $scope.sidePanelOpen = false
    $scope.sidePanelType = 'stats'
    $scope.defaultDir = 'rtl'
    $scope.oppDir = 'ltr'
    $scope.outHTML = ''
    $scope.oppDirText = ''
    $scope.promptInput = ''
    $scope.searchQuery = ''
    $scope.searchReplace = ''
    $scope.searchMatches = []
    $scope.searchIndex = -1
    $scope.fileName = ''
    $scope.focusMode = false
    $scope.saved = true
    $scope.editorFocused = false
    $scope.scrolled = false
    $scope.resizeActive = false
    $scope.toast = { show: false, message: '', type: 'info' }
    $scope.uiLangs = UILANGS
    $scope.uiLang = $scope.uiLangs[0]
    $scope.helpContent = ''

    // Default settings
    $scope.settings = {
        fontSize: 15,
        lineHeight: 1.8,
        autoSave: true,
        wordWrap: true,
        lineNumbers: true,
        scrollSync: true,
        autoPreview: true
    }

    // Undo/redo
    var history = []
    var historyPos = -1
    var skipHistory = false

    // Deferred auto-save
    var saveTimer = null
    var statsTimer = null

    // Scroll sync
    var syncingScroll = false

    // ===============================
    // TOOLBAR DEFINITIONS
    // ===============================
    function wrapText(before, after) {
        var ta = document.getElementById('raw_text')
        if (!ta) return
        var start = ta.selectionStart
        var end = ta.selectionEnd
        var text = $scope.rawText
        var selected = text.substring(start, end) || ''
        $scope.rawText = text.substring(0, start) + before + selected + after + text.substring(end)
        $scope.pushHistory()
        $timeout(function () {
            ta.focus()
            ta.selectionStart = start + before.length
            ta.selectionEnd = start + before.length + selected.length
        })
    }

    function insertText(text) {
        var ta = document.getElementById('raw_text')
        if (!ta) return
        var start = ta.selectionStart
        var end = ta.selectionEnd
        $scope.rawText = $scope.rawText.substring(0, start) + text + $scope.rawText.substring(end)
        $scope.pushHistory()
        $timeout(function () {
            ta.focus()
            ta.selectionStart = ta.selectionEnd = start + text.length
        })
    }

    function insertLinePrefix(prefix) {
        var ta = document.getElementById('raw_text')
        if (!ta) return
        var start = ta.selectionStart
        var text = $scope.rawText
        var lineStart = text.lastIndexOf('\n', start - 1) + 1
        $scope.rawText = text.substring(0, lineStart) + prefix + text.substring(lineStart)
        $scope.pushHistory()
        $timeout(function () {
            ta.focus()
            ta.selectionStart = ta.selectionEnd = start + prefix.length
        })
    }

    function wrapLines(prefix, suffix) {
        suffix = suffix || ''
        var ta = document.getElementById('raw_text')
        if (!ta) return
        var start = ta.selectionStart
        var end = ta.selectionEnd
        var text = $scope.rawText
        var lineStart = text.lastIndexOf('\n', start - 1) + 1
        var lineEnd = text.indexOf('\n', end)
        if (lineEnd === -1) lineEnd = text.length
        var lines = text.substring(lineStart, lineEnd).split('\n')
        var newLines = lines.map(function (l) { return prefix + l + suffix })
        $scope.rawText = text.substring(0, lineStart) + newLines.join('\n') + text.substring(lineEnd)
        $scope.pushHistory()
        $timeout(function () { ta.focus() })
    }

    $scope.toolbarGroups = [
        {
            buttons: [
                { label: 'Bold', icon: '<b>B</b>', action: function () { wrapText('**', '**') } }
            ]
        },
        {
            buttons: [
                { label: 'Italic', icon: '<i>I</i>', action: function () { wrapText('*', '*') } }
            ]
        },
        {
            buttons: [
                { label: 'Strikethrough', icon: '<s>S</s>', action: function () { wrapText('~~', '~~') } }
            ]
        },
        {
            buttons: [
                { label: 'Heading 1', icon: 'H1', action: function () { insertLinePrefix('# ') } },
                { label: 'Heading 2', icon: 'H2', action: function () { insertLinePrefix('## ') } },
                { label: 'Heading 3', icon: 'H3', action: function () { insertLinePrefix('### ') } }
            ]
        },
        {
            buttons: [
                { label: 'Bullet List', icon: '•', action: function () { insertLinePrefix('- ') } },
                { label: 'Numbered List', icon: '1.', action: function () { insertLinePrefix('1. ') } },
                { label: 'Task List', icon: '☑', action: function () { insertLinePrefix('- [ ] ') } }
            ]
        },
        {
            buttons: [
                { label: 'Blockquote', icon: '❝', action: function () { insertLinePrefix('> ') } },
                { label: 'Code Block', icon: '</>', action: function () { wrapText('```\n', '\n```') } },
                { label: 'Inline Code', icon: '`', action: function () { wrapText('`', '`') } }
            ]
        },
        {
            buttons: [
                { label: 'Link', icon: '🔗', action: function () { wrapText('[', '](url)') } },
                { label: 'Image', icon: '🖼', action: function () { wrapText('![', '](url)') } },
                { label: 'Table', icon: '⊞', action: function () { insertText('\n| Header | Header |\n| ------ | ------ |\n| Cell | Cell |\n') } }
            ]
        },
        {
            buttons: [
                { label: 'Horizontal Rule', icon: '—', action: function () { insertText('\n---\n') } }
            ]
        },
        {
            condition: false,
            buttons: [
                { label: 'Undo', icon: '↩', action: function () { $scope.undo() }, disabled: function () { return historyPos <= 0 } },
                { label: 'Redo', icon: '↪', action: function () { $scope.redo() }, disabled: function () { return historyPos >= history.length - 1 } }
            ]
        }
    ]

    // ===============================
    // HISTORY (undo/redo)
    // ===============================
    $scope.pushHistory = function () {
        if (skipHistory) return
        historyPos++
        history = history.slice(0, historyPos)
        history.push($scope.rawText)
        if (history.length > MAX_HISTORY) {
            history.shift()
            historyPos--
        }
        $scope.saved = false
    }

    $scope.undo = function () {
        if (historyPos <= 0) return
        skipHistory = true
        historyPos--
        $scope.rawText = history[historyPos]
        $scope.onTextChange()
        skipHistory = false
    }

    $scope.redo = function () {
        if (historyPos >= history.length - 1) return
        skipHistory = true
        historyPos++
        $scope.rawText = history[historyPos]
        $scope.onTextChange()
        skipHistory = false
    }

    // ===============================
    // TEXT CHANGE HANDLER
    // ===============================
    $scope.onTextChange = function () {
        $scope.saved = false
        $scope.pushHistory()
        $scope.updateStats()

        if ($scope.settings.autoSave) {
            if (saveTimer) $timeout.cancel(saveTimer)
            saveTimer = $timeout(function () {
                $scope.autoSave()
            }, DEBOUNCE_DELAY)
        }
    }

    // ===============================
    // STATS
    // ===============================
    $scope.stats = { words: 0, chars: 0, charsNoSpace: 0, lines: 0, paragraphs: 0, readingTime: '0s', headings: 0, links: 0 }

    $scope.updateStats = function () {
        var text = $scope.rawText || ''
        $scope.stats.chars = text.length
        $scope.stats.charsNoSpace = text.replace(/\s/g, '').length
        $scope.stats.words = text.trim() ? text.trim().split(/\s+/).length : 0
        $scope.stats.lines = text ? text.split('\n').length : 0
        $scope.stats.paragraphs = text ? text.split(/\n\s*\n/).filter(function (p) { return p.trim() }).length : 0

        var wpm = 200
        var mins = $scope.stats.words / wpm
        if (mins < 1) {
            $scope.stats.readingTime = Math.ceil(mins * 60) + 's'
        } else if (mins < 60) {
            $scope.stats.readingTime = Math.ceil(mins) + 'm'
        } else {
            $scope.stats.readingTime = Math.floor(mins / 60) + 'h ' + Math.ceil(mins % 60) + 'm'
        }

        var hCount = 0
        var lCount = 0
        var lines = text.split('\n')
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim()
            if (/^#{1,6}\s/.test(l)) hCount++
            if (/\[.*?\]\(.*?\)/.test(l)) lCount++
        }
        $scope.stats.headings = hCount
        $scope.stats.links = lCount

        $scope.updateLineNumbers()
    }

    // ===============================
    // LINE NUMBERS
    // ===============================
    $scope.lineNumArray = []

    $scope.updateLineNumbers = function () {
        var count = ($scope.rawText || '').split('\n').length
        if (!$scope.lineNumArray || $scope.lineNumArray.length !== count) {
            $scope.lineNumArray = new Array(count)
        }
    }

    // ===============================
    // AUTO SAVE
    // ===============================
    $scope.autoSave = function () {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                text: $scope.rawText,
                dir: $scope.defaultDir,
                theme: $scope.theme,
                saved: Date.now()
            }))
            $scope.saved = true
        } catch (e) { }
    }

    $scope.saveSettings = function () {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify($scope.settings))
        } catch (e) { }
    }

    $scope.loadSavedData = function () {
        try {
            var data = JSON.parse(localStorage.getItem(STORAGE_KEY))
            if (data && data.text && !$location.search().src) {
                $scope.rawText = data.text
                if (data.dir) $scope.defaultDir = data.dir
                if (data.theme) {
                    $scope.theme = data.theme
                    $scope.themeToggle = data.theme === 'night'
                }
                $scope.saved = true
            }
            var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY))
            if (settings) {
                for (var k in settings) {
                    if ($scope.settings.hasOwnProperty(k)) $scope.settings[k] = settings[k]
                }
            }
        } catch (e) { }
        $scope.applySettings()
        $scope.updateStats()
    }

    // ===============================
    // SETTINGS
    // ===============================
    $scope.applySettings = function () {
        $scope.editorStyle = {
            fontSize: $scope.settings.fontSize + 'px',
            lineHeight: $scope.settings.lineHeight,
            whiteSpace: $scope.settings.wordWrap ? 'pre-wrap' : 'pre',
            overflowX: $scope.settings.wordWrap ? 'hidden' : 'auto'
        }
        $scope.saveSettings()
        $scope.updateLineNumbers()
    }

    $scope.adjustFontSize = function (delta) {
        $scope.settings.fontSize = Math.max(12, Math.min(28, $scope.settings.fontSize + delta))
        $scope.applySettings()
    }

    $scope.adjustLineHeight = function (delta) {
        $scope.settings.lineHeight = Math.round(Math.max(1.2, Math.min(2.5, $scope.settings.lineHeight + delta)) * 10) / 10
        $scope.applySettings()
    }

    // ===============================
    // SEARCH
    // ===============================
    $scope.toggleSearch = function () {
        $scope.showSearch = !$scope.showSearch
        if ($scope.showSearch) {
            $scope.showSearchReplace = false
            $timeout(function () {
                document.getElementById('searchInput') && document.getElementById('searchInput').focus()
            })
        } else {
            $scope.searchQuery = ''
            $scope.searchMatches = []
            $scope.searchIndex = -1
        }
    }

    $scope.closeSearch = function () {
        $scope.showSearch = false
        $scope.searchQuery = ''
        $scope.searchMatches = []
        $scope.searchIndex = -1
    }

    $scope.doSearch = function () {
        if (!$scope.searchQuery) {
            $scope.searchMatches = []
            $scope.searchIndex = -1
            return
        }
        var text = $scope.rawText || ''
        var q = $scope.searchQuery
        var matches = []
        var idx = 0
        var lowerText = text.toLowerCase()
        var lowerQ = q.toLowerCase()
        while (true) {
            var pos = lowerText.indexOf(lowerQ, idx)
            if (pos === -1) break
            matches.push(pos)
            idx = pos + 1
        }
        $scope.searchMatches = matches
        $scope.searchIndex = matches.length > 0 ? 0 : -1
        $scope.highlightSearch()
    }

    $scope.searchNext = function () {
        if ($scope.searchMatches.length === 0) return
        $scope.searchIndex = ($scope.searchIndex + 1) % $scope.searchMatches.length
        $scope.highlightSearch()
    }

    $scope.searchPrev = function () {
        if ($scope.searchMatches.length === 0) return
        $scope.searchIndex = ($scope.searchIndex - 1 + $scope.searchMatches.length) % $scope.searchMatches.length
        $scope.highlightSearch()
    }

    $scope.highlightSearch = function () {
        var ta = document.getElementById('raw_text')
        if (!ta || $scope.searchIndex < 0 || $scope.searchIndex >= $scope.searchMatches.length) return
        var pos = $scope.searchMatches[$scope.searchIndex]
        ta.focus()
        ta.selectionStart = pos
        ta.selectionEnd = pos + $scope.searchQuery.length
    }

    $scope.searchKeydown = function ($event) {
        if ($event.key === 'Enter') {
            $event.preventDefault()
            if ($event.shiftKey) $scope.searchPrev()
            else $scope.searchNext()
        }
        if ($event.key === 'Escape') $scope.closeSearch()
    }

    $scope.replaceKeydown = function ($event) {
        if ($event.key === 'Enter') {
            $event.preventDefault()
            $scope.replaceOne()
        }
    }

    $scope.replaceOne = function () {
        if ($scope.searchIndex < 0 || $scope.searchIndex >= $scope.searchMatches.length) return
        var pos = $scope.searchMatches[$scope.searchIndex]
        var qLen = $scope.searchQuery.length
        var before = $scope.rawText.substring(0, pos)
        var after = $scope.rawText.substring(pos + qLen)
        $scope.rawText = before + $scope.searchReplace + after
        $scope.pushHistory()
        $scope.doSearch()
    }

    $scope.replaceAll = function () {
        if (!$scope.searchQuery) return
        var re = new RegExp($scope.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        $scope.rawText = $scope.rawText.replace(re, $scope.searchReplace)
        $scope.pushHistory()
        $scope.doSearch()
    }

    // ===============================
    // SIDEBAR
    // ===============================
    $scope.toggleSidebar = function () { $scope.sidebarOpen = !$scope.sidebarOpen }
    $scope.closeSidebar = function () { $scope.sidebarOpen = false }

    // ===============================
    // SIDE PANEL
    // ===============================
    $scope.toggleSidePanel = function (type) {
        if ($scope.sidePanelOpen && $scope.sidePanelType === type) {
            $scope.closeSidePanel()
        } else {
            $scope.sidePanelType = type
            $scope.sidePanelOpen = true
        }
    }
    $scope.closeSidePanel = function () { $scope.sidePanelOpen = false }

    // ===============================
    // FOCUS MODE
    // ===============================
    $scope.toggleFocusMode = function () {
        $scope.focusMode = !$scope.focusMode
        document.body.classList.toggle('focus-mode', $scope.focusMode)
        if ($scope.focusMode) {
            $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.focusMode) || 'Focus mode enabled', 'info')
        }
    }

    // ===============================
    // SCROLL SYNC
    // ===============================
    $scope.onEditorScroll = function () {
        if (!$scope.settings.scrollSync || syncingScroll) return
        syncingScroll = true
        var ta = document.getElementById('raw_text')
        var preview = document.getElementById('output_outer')
        if (ta && preview) {
            var pct = ta.scrollTop / (ta.scrollHeight - ta.clientHeight)
            preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight)
        }
        $timeout(function () { syncingScroll = false }, 50)
    }

    $scope.onPreviewScroll = function () {
        if (!$scope.settings.scrollSync || syncingScroll) return
        syncingScroll = true
        var ta = document.getElementById('raw_text')
        var preview = document.getElementById('output_outer')
        if (ta && preview) {
            var pct = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
            ta.scrollTop = pct * (ta.scrollHeight - ta.clientHeight)
        }
        $timeout(function () { syncingScroll = false }, 50)
    }

    // ===============================
    // SPLITTER RESIZE
    // ===============================
    $scope.startResize = function ($event) {
        $event.preventDefault()
        $scope.resizeActive = true
        var editorArea = document.getElementById('editor-area')
        var textarea = document.getElementById('raw_text')
        var startX = $event.clientX
        var startWidth = textarea ? textarea.offsetWidth : 0

        function onMove(e) {
            if (!textarea || !editorArea) return
            var dx = e.clientX - startX
            textarea.style.width = (startWidth + dx) + 'px'
            textarea.style.flex = 'none'
        }

        function onUp() {
            $scope.resizeActive = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            $scope.$apply()
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        $scope.$apply()
    }

    // ===============================
    // FILE OPERATIONS
    // ===============================
    $scope.newMarkdown = function () {
        if ($location.search().src !== undefined) {
            $location.search('src', null)
        }
        if ($scope.rawText && !$scope.saved) {
            if (!confirm(($scope.ui && $scope.ui.confirm && $scope.ui.confirm.discard) || 'Discard unsaved changes?')) return
        }
        $scope.rawText = ''
        $scope.fileName = ''
        $scope.historyReset()
        $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.newDoc) || 'New document created', 'info')
    }

    $scope.openHandler = function () {
        $scope.showHTMLPrompt = false
        $scope.showOppDirPrompt = false
        $scope.showOpenPrompt = !$scope.showOpenPrompt
        if ($scope.showOpenPrompt) $scope.promptInput = ''
    }

    $scope.saveMarkdown = function () {
        var b = new Blob([$scope.rawText], { type: "text/plain;charset=utf-8" })
        var name = $scope.fileName || 'urdown'
        if (!name.endsWith('.md')) name += '.md'
        saveAs(b, name)
        $scope.saved = true
        $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.saved) || 'File saved', 'success')
    }

    $scope.exportPDF = function () {
        $window.print()
    }

    $scope.showHTMLPanel = function () {
        $scope.showHTMLPrompt = !$scope.showHTMLPrompt
        $scope.showOpenPrompt = false
        $scope.showOppDirPrompt = false
        if ($scope.showHTMLPrompt) $scope.showHTML()
    }

    $scope.showHTML = function () {
        var out = document.getElementById("output_outer").innerHTML
        $http({
            method: 'GET',
            url: './static/css/output.css'
        }).then(function (response) {
            $scope.outHTML = '<div id="output_outer" dir="' + $scope.defaultDir +
                '"><style scoped>' + response.data + '</style>' + out + '</div>'
        }, function () {
            $scope.outHTML = '<div id="output_outer" dir="' + $scope.defaultDir + '">' + out + '</div>'
        })
    }

    $scope.copyHTML = function () {
        copyToClipboard($scope.outHTML)
        $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.copied) || 'HTML copied to clipboard', 'success')
    }

    $scope.copyPreview = function () {
        var el = document.getElementById('output_inner')
        if (el) {
            copyToClipboard(el.innerHTML)
            $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.copied) || 'Preview copied to clipboard', 'success')
        }
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
        } else {
            var ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
        }
    }

    $scope.readMarkdown = function () {
        var reader = new FileReader()
        reader.onload = function (e) {
            $scope.$apply(function () {
                $scope.rawText = reader.result
                $scope.fileName = document.getElementById('fileinput').files[0].name
                $scope.showOpenPrompt = false
                $scope.historyReset()
                $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.fileLoaded) || 'File loaded', 'success')
            })
        }
        reader.onerror = function () {
            $scope.$apply(function () {
                $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.error) || 'Error reading file', 'error')
            })
        }
        var f = document.getElementById('fileinput').files[0]
        if (f) {
            reader.readAsText(f)
        }
    }

    // ===============================
    // DRAG & DROP
    // ===============================
    function setupDragDrop() {
        var app = document.getElementById('app')
        if (!app) return
        app.addEventListener('dragover', function (e) {
            e.preventDefault()
            e.stopPropagation()
            app.classList.add('dragover')
            app.setAttribute('data-drag-label', ($scope.ui && $scope.ui.prompt && $scope.ui.prompt.dropFile) || 'Drop file here')
        })
        app.addEventListener('dragleave', function (e) {
            e.preventDefault()
            e.stopPropagation()
            app.classList.remove('dragover')
        })
        app.addEventListener('drop', function (e) {
            e.preventDefault()
            e.stopPropagation()
            app.classList.remove('dragover')
            var files = e.dataTransfer.files
            if (files.length > 0) {
                var reader = new FileReader()
                reader.onload = function (ev) {
                    $scope.$apply(function () {
                        $scope.rawText = reader.result
                        $scope.fileName = files[0].name
                        $scope.historyReset()
                        $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.fileLoaded) || 'File loaded', 'success')
                    })
                }
                reader.readAsText(files[0])
            }
        })
    }

    // ===============================
    // MODALS / PROMPTS
    // ===============================
    $scope.okHandler = function () {
        if ($scope.showOpenPrompt) {
            $scope.getMarkdown($scope.promptInput)
        } else if ($scope.showOppDirPrompt) {
            var ta = document.getElementById('raw_text')
            var start = ta ? ta.selectionStart : 0
            var end = ta ? ta.selectionEnd : 0
            $scope.rawText = $scope.rawText.slice(0, start) + '\n,,,\n' + $scope.oppDirText + '\n,,,\n' + $scope.rawText.slice(end)
            $scope.oppDirText = ''
            $scope.pushHistory()
        }
        $scope.showOppDirPrompt = false
        $scope.showOpenPrompt = false
        $scope.focus('raw_text')
    }

    $scope.escHandler = function () {
        $scope.showHTMLPrompt = false
        $scope.showOppDirPrompt = false
        $scope.showOpenPrompt = false
        $scope.showShortcutsModal = false
        $scope.showHelpModal = false
        $scope.outHTML = ''
        $scope.focus('raw_text')
    }

    $scope.focus = function (id) {
        $timeout(function () {
            document.getElementById(id) && document.getElementById(id).focus()
        })
    }

    // ===============================
    // NIGHT MODE
    // ===============================
    $scope.toggleNightMode = function () {
        $scope.theme = $scope.themeToggle ? 'night' : 'day'
        $scope.saveSettings()
    }

    // ===============================
    // READ MODE
    // ===============================
    $scope.toggleReadMode = function () {
        $scope.editMode = !$scope.editMode
    }

    $scope.restoreContainer = function () {
        if ($scope.editMode) {
            var el = document.getElementById('editor-area')
            if (el) el.scrollTop = 0
        }
    }

    // ===============================
    // RTL/LTR
    // ===============================
    $scope.reverseDir = function () {
        var oppDivs = document.querySelectorAll('#output_inner .opp_dir_div')
        for (var i = 0; i < oppDivs.length; i++) {
            oppDivs[i].setAttribute('dir', $scope.defaultDir)
        }
        if ($scope.defaultDir == 'rtl') {
            $scope.defaultDir = 'ltr'
            OPPOSITE_DIR = 'rtl'
        } else {
            $scope.defaultDir = 'rtl'
            OPPOSITE_DIR = 'ltr'
        }
        $scope.oppDir = OPPOSITE_DIR
        document.documentElement.dir = $scope.defaultDir
        $scope.saveSettings()
    }

    // ===============================
    // MARKDOWN LOADING
    // ===============================
    $scope.loadMarkdown = function () {
        if ($location.search().src !== undefined) {
            $scope.getMarkdown($location.search().src)
        }
    }

    $scope.getMarkdown = function (path) {
        if (path) {
            $http({
                method: 'GET',
                url: path
            }).then(function (response) {
                $scope.rawText = response.data
                $scope.fileName = path.split('/').pop() || ''
                $scope.historyReset()
                $scope.showOpenPrompt = false
            }, function () {
                $scope.rawText = ''
                $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.loadError) || 'Could not load file', 'error')
            })
        }
    }

    $scope.loadSettings = function () {
        if ($location.search().nightMode !== undefined) {
            $scope.themeToggle = $location.search().nightMode === 'true'
            $scope.theme = $scope.themeToggle ? 'night' : 'day'
        }
        if ($location.search().editMode !== undefined) {
            $scope.editMode = $location.search().editMode === 'true'
        }
        if ($location.search().dir !== undefined) {
            if ($scope.defaultDir !== $location.search().dir) {
                $scope.reverseDir()
            }
        }
    }

    // ===============================
    // HISTORY RESET
    // ===============================
    $scope.historyReset = function () {
        history = [$scope.rawText]
        historyPos = 0
    }

    // ===============================
    // UI LANGUAGE
    // ===============================
    $scope.loadUI = function () {
        $http({
            method: 'GET',
            url: './static/ui/' + $scope.uiLang.value + '.json'
        }).then(function (response) {
            $scope.ui = response.data
            // re-init toolbar labels from UI
            $scope.initToolbarLabels()
            if ($scope.ui.helpLink) {
                $scope.helpLink = $scope.ui.helpLink
                $scope.loadHelpContent()
            }
        }, function () {
            console.log('Could not load ui.')
        })
    }

    $scope.initToolbarLabels = function () {
        var ui = $scope.ui
        if (!ui) return
        var groups = $scope.toolbarGroups
        var flat = []
        for (var g = 0; g < groups.length; g++) {
            for (var b = 0; b < groups[g].buttons.length; b++) {
                flat.push(groups[g].buttons[b])
            }
        }
        if (flat.length >= 17) {
            flat[0].label = ui.toolbar && ui.toolbar.bold || 'Bold'
            flat[1].label = ui.toolbar && ui.toolbar.italic || 'Italic'
            flat[2].label = ui.toolbar && ui.toolbar.strikethrough || 'Strikethrough'
            flat[3].label = ui.toolbar && ui.toolbar.heading1 || 'Heading 1'
            flat[4].label = ui.toolbar && ui.toolbar.heading2 || 'Heading 2'
            flat[5].label = ui.toolbar && ui.toolbar.heading3 || 'Heading 3'
            flat[6].label = ui.toolbar && ui.toolbar.bulletList || 'Bullet List'
            flat[7].label = ui.toolbar && ui.toolbar.numberedList || 'Numbered List'
            flat[8].label = ui.toolbar && ui.toolbar.taskList || 'Task List'
            flat[9].label = ui.toolbar && ui.toolbar.blockquote || 'Blockquote'
            flat[10].label = ui.toolbar && ui.toolbar.codeBlock || 'Code Block'
            flat[11].label = ui.toolbar && ui.toolbar.inlineCode || 'Inline Code'
            flat[12].label = ui.toolbar && ui.toolbar.link || 'Link'
            flat[13].label = ui.toolbar && ui.toolbar.image || 'Image'
            flat[14].label = ui.toolbar && ui.toolbar.table || 'Table'
            flat[15].label = ui.toolbar && ui.toolbar.horizontalRule || 'Horizontal Rule'
        }
    }

    $scope.loadHelpContent = function () {
        var link = $scope.ui && $scope.ui.helpLink
        if (link) {
            // extract the src param from the URL fragment
            var match = link.match(/src=([^&]+)/)
            var src = match ? decodeURIComponent(match[1]) : null
            if (src) {
                $http.get(src).then(function (r) {
                    $scope.helpContent = r.data
                })
            }
        }
        if (!$scope.helpContent) {
            $scope.helpContent = '# Markdown Help\n\nUse `**bold**`, `*italic*`, `## Heading`...\n\nSee the [documentation](https://github.com/hazrmard/Urdown) for more.'
        }
    }

    // ===============================
    // SHORTCUTS MODAL
    // ===============================
    $scope.shortcuts = [
        { key: 'Ctrl+S', label: 'Save' },
        { key: 'Ctrl+O', label: 'Open' },
        { key: 'Ctrl+M', label: 'New document' },
        { key: 'Ctrl+H', label: 'Show HTML' },
        { key: 'Ctrl+E', label: 'Toggle edit mode' },
        { key: 'Ctrl+D', label: 'Toggle night mode' },
        { key: 'Ctrl+Z', label: 'Undo' },
        { key: 'Ctrl+Shift+Z', label: 'Redo' },
        { key: 'Ctrl+F', label: 'Search' },
        { key: 'Ctrl+,', label: 'Insert opposite direction text' },
        { key: 'Ctrl+Enter', label: 'Confirm prompt' },
        { key: 'F11', label: 'Toggle focus mode' },
        { key: 'Escape', label: 'Close modal / Cancel' }
    ]

    $scope.toggleShortcuts = function () {
        $scope.showShortcutsModal = !$scope.showShortcutsModal
        $scope.closeSidebar()
    }

    $scope.toggleHelp = function () {
        $scope.showHelpModal = !$scope.showHelpModal
        $scope.closeSidebar()
    }

    // ===============================
    // TOAST
    // ===============================
    $scope.showToast = function (message, type) {
        type = type || 'info'
        $scope.toast.message = message
        $scope.toast.type = type
        $scope.toast.show = true
        $timeout(function () {
            $scope.toast.show = false
        }, 2500)
    }

    // ===============================
    // KEYBOARD SHORTCUTS
    // ===============================
    $scope.shortcutHandler = function ($event) {
        var key = $event.key
        var code = $event.keyCode || $event.which

        if ($event.ctrlKey || $event.metaKey) {
            switch (key) {
                case 's': case 'S': case undefined:
                    if (code === 83) { $event.preventDefault(); $scope.saveMarkdown(); return }
            }
            switch (key) {
                case 'o': case 'O': case undefined:
                    if (code === 79) { $event.preventDefault(); $scope.openHandler(); return }
            }
            switch (key) {
                case 'm': case 'M': case undefined:
                    if (code === 77) { $event.preventDefault(); $scope.newMarkdown(); return }
            }
            switch (key) {
                case 'z': case 'Z': case undefined:
                    if (code === 90) {
                        $event.preventDefault()
                        if ($event.shiftKey) $scope.redo()
                        else $scope.undo()
                        return
                    }
            }
            switch (key) {
                case 'h': case 'H': case undefined:
                    if (code === 72) { $event.preventDefault(); $scope.showHTMLPanel(); return }
            }
            switch (key) {
                case 'e': case 'E': case undefined:
                    if (code === 69) { $event.preventDefault(); $scope.editMode = !$scope.editMode; return }
            }
            switch (key) {
                case 'd': case 'D': case undefined:
                    if (code === 68) { $event.preventDefault(); $scope.themeToggle = !$scope.themeToggle; $scope.toggleNightMode(); return }
            }
            switch (key) {
                case 'f': case 'F': case undefined:
                    if (code === 70) { $event.preventDefault(); $scope.toggleSearch(); return }
            }
            switch (key) {
                case ',': case '،': case undefined:
                    if (code === 188 || key === ',' || key === '،') {
                        $event.preventDefault()
                        $scope.showOppDirPrompt = !$scope.showOppDirPrompt
                        if ($scope.showOppDirPrompt) {
                            var ta = document.getElementById('raw_text')
                            if (ta) {
                                var start = ta.selectionStart
                                var end = ta.selectionEnd
                                $scope.oppDirText = $scope.rawText.slice(start, end)
                            }
                            $scope.focus('opp_input')
                        }
                        $scope.showHTMLPrompt = false
                        $scope.showOpenPrompt = false
                        return
                    }
            }
            switch (key) {
                case 'Enter': case undefined:
                    if (code === 13) { $event.preventDefault(); $scope.okHandler(); return }
            }
        }

        if (key === 'Escape' || code === 27) {
            if ($scope.showSearch) { $scope.closeSearch(); return }
            if ($scope.sidebarOpen) { $scope.closeSidebar(); return }
            if ($scope.sidePanelOpen) { $scope.closeSidePanel(); return }
            $scope.escHandler()
            return
        }

        if (key === 'F11' || code === 122) {
            $event.preventDefault()
            if (!$scope.showShortcutsModal && !$scope.showHelpModal) {
                $scope.toggleFocusMode()
            }
        }

        if (key === '?' && !$event.ctrlKey && !$event.altKey && !$event.metaKey) {
            // '?' key - only if not in an input
            var tag = $event.target && $event.target.tagName
            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                $event.preventDefault()
                $scope.toggleShortcuts()
            }
        }
    }

    // ===============================
    // INIT
    // ===============================
    $scope.initApp = function () {
        $scope.loadSavedData()
        $scope.loadSettings()
        $scope.historyReset()
        $scope.updateStats()
        setupDragDrop()

        // Watch URL changes
        $scope.$watch(function () { return $location.search() }, function () {
            if ($location.search().src) {
                $scope.loadMarkdown()
                $scope.loadSettings()
            }
        }, true)

        // Watch text for stats
        $scope.$watch('rawText', function (nv, ov) {
            if (nv !== ov) {
                $scope.updateStats()
                $scope.updateLineNumbers()
            }
        })

        // Detect scroll on topbar
        angular.element($window).bind('scroll', function () {
            $scope.scrolled = window.pageYOffset > 0
            $scope.$apply()
        })

        // Init direction
        document.documentElement.dir = $scope.defaultDir

        // Load placeholder
        $http.get('./static/placeholder.txt').then(function (r) {
            $scope.placeholder = r.data
        })

        $scope.showToast(($scope.ui && $scope.ui.toast && $scope.ui.toast.welcome) || 'Welcome to Urdown', 'info')
    }

    $scope.scrollToTop = function () {
        var ta = document.getElementById('raw_text')
        if (ta) ta.scrollTop = 0
        var preview = document.getElementById('output_outer')
        if (preview) preview.scrollTop = 0
    }
})
