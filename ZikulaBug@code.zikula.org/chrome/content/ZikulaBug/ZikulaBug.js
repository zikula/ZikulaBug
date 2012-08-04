FBL.ns(function() {
    with (FBL) {
        // namespace
        var ZikulaBug = top.ZikulaBug = {};
        ZikulaBug.Meta = {
            id: 'ZikulaBug@code.zikula.org',
            secKeyHeader: 'x-zikula-debugtoolbar'
        };
        Components.utils['import']('resource://gre/modules/AddonManager.jsm');
        AddonManager.getAddonByID(ZikulaBug.Meta.id, function(addon) {
            ZikulaBug.Meta.version = addon.version;
        });
        // Firebug 1.8 compatibility
        if (typeof ErrorCopy == 'undefined') {
            var ErrorCopy = FirebugReps.ErrorCopy;
        }

        // localisation
        function $ZB_STR(name)
        {
            return document.getElementById("strings_ZikulaBug").getString(name);
        }

        function $ZB_STRF(name, args)
        {
            return document.getElementById("strings_ZikulaBug")
                .getFormattedString(name, args);
        }

        // utils
        ZikulaBug.Util = {};
        ZikulaBug.Util.parseTime = function (time, unit) {
            unit = unit ? ' ms' : '';
            return Number((Number(time)*1000).toFixed(2)).toLocaleString() + unit;
        };
        ZikulaBug.Util.parseMemory = function (number, units, format) {
            var divisor = 1024,
                unit = units ? ' kb' : '';
            if (format == 'mb') {
                divisor = 1024*1024;
                unit = units ? ' mb' : ''
            }
            return Number((Number(number)/divisor).toFixed(1)).toLocaleString() + unit;
        };
        ZikulaBug.Util.getHost = function(url) {
            return url.replace(/(https?:\/\/(www\.)?)/i,'');
        };
        ZikulaBug.Util.getPrefs = function(key) {
            if (!key) {
                return null;
            }
            var pref = Firebug.getPref(Firebug.prefDomain, 'ZikulaBugPanel.' + key);
            try {
                pref = JSON.parse(pref);
            } catch (e) {}
            return pref;
        };
        ZikulaBug.Util.setPrefs = function(key, value) {
            if (!key) {
                return null;
            }
            if (['string', 'boolean', 'number'].indexOf(typeof(value)) < 0) {
                value = JSON.stringify(value)
            }
            return Firebug.setPref(Firebug.prefDomain, 'ZikulaBugPanel.' + key, value);
        };
        ZikulaBug.Util.getPanel = function(context) {
            context = context || Firebug.currentContext;
            return context.getPanel('ZikulaBugPanel');
        };

        // http observer
        ZikulaBug.httpRequestObserver = {
            observing: false,
            observe: function(subject, topic, data) {
                if (topic == 'http-on-modify-request') {
                    var httpChannel = subject.QueryInterface(Components.interfaces.nsIHttpChannel),
                        prefs = ZikulaBug.Util.getPrefs('secKey') || {},
                        key = Object.keys(prefs).filter(function (element, index, array) {
                            return (httpChannel.name.indexOf(element) >= 0) ;
                        }).sort().reverse()[0];
                    if (key && prefs[key]) {
                        httpChannel.setRequestHeader(ZikulaBug.Meta.secKeyHeader, prefs[key], false);
                    }
                }
            },
            get observerService() {
                return Components.classes['@mozilla.org/observer-service;1']
                    .getService(Components.interfaces.nsIObserverService);
            },
            register: function() {
                if (!this.observing) {
                    this.observerService.addObserver(this, 'http-on-modify-request', false);
                }
                this.observing = true;
            },
            unregister: function() {
                this.observerService.removeObserver(this, 'http-on-modify-request');
                this.observing = false;
            }
        };

        // templates
        ZikulaBug.Reps = [];
        ZikulaBug.Tpl = {};
        ZikulaBug.Tpl.ignoreVars = extend(ignoreVars,{
            '__phpClassName': 1
        });
        ZikulaBug.Tpl.getRep = function(object, context) {
            var type = typeof(object);
            if (type == 'object' && object instanceof String) {
                type = 'string';
            }

            for (var i = 0; i < ZikulaBug.Reps.length; ++i) {
                var rep = ZikulaBug.Reps[i];
                try {
                    if (rep.supportsObject(object, type, (context?context:Firebug.currentContext) )) {
                        return rep;
                    }
                } catch (exc) {}
            }
            // nothing found - use firebug default reps
            return Firebug.getRep(object);
        };

        // Base for tpl
        ZikulaBug.Tpl.BaseRep = domplate(Firebug.Rep, ZikulaBug.Util, {
            inspectable: false
        });

        ZikulaBug.Tpl.MainTag = domplate({
            tag: DIV({'id': '$id', 'class': 'ZikulaBugWrapper'})
        });

        ZikulaBug.Tpl.Info = domplate({
            tag: DIV({'id': '$id', 'class': 'ZikulaBugWrapper'},
                H1('$title'),
                P('$info')
            )
        });

        // General template for browsing objects list, based on DomPanel
        ZikulaBug.Tpl.VarList = domplate(ZikulaBug.Tpl.BaseRep, {
            insertSliceSize: 18,
            insertInterval: 40,

            varListTag: TABLE({'class': 'domTable', cellpadding: 0, cellspacing: 0, onclick: '$onVarListClick'},
                TBODY(
                    TAG('$varListSizerRow'),
                    FOR('member', '$object|getVarListMembers', TAG('$varListContentRow', {'member': '$member'}))
                )
            ),
            varListSizerRow: TR(
                TD({width: '30%'}),
                TD({width: '70%'})
            ),
            varListRowTag: FOR('member', '$members', TAG('$varListContentRow', {'member': '$member'})),
            varListContentRow: TR({'class': 'memberRow $member.open $member.type\\Row', $hasChildren: '$member.hasChildren',
                level: '$member.level', _domObject: '$member'},
                TD({'class': 'memberLabelCell', style: 'padding-left: $member.indent\\px'},
                    DIV({'class': 'memberLabel $member.type\\Label'},
                        TAG('$member.nameTag', {object:'$member.name'})
                    )
                ),
                TD({'class': 'memberValueCell'},
                    TAG('$member.tag', {object: '$member.value'})
                )
            ),
            onVarListClick: function(event) {
                if (!isLeftClick(event)) {
                    return;
                }
                var row = getAncestorByClass(event.target, 'memberRow'),
                    isStringLabel = !getAncestorByClass(event.target, 'memberLabel') && hasClass(event.target, 'objectBox-string');
                if (hasClass(row, 'hasChildren') && !isStringLabel) {
                    this.toggleVarListRow(row);
                    cancelEvent(event);
                } else {
                    cancelEvent(event);
                }
            },
            toggleVarListRow: function(row) {
                var level = parseInt(row.getAttribute('level'));
                var toggles = row.parentNode.parentNode.toggles;
                var target = row.lastChild.firstChild;
                var isString = hasClass(target, 'objectBox-string');

                if (hasClass(row, 'opened')) {
                    removeClass(row, 'opened');
                    setClass(row, 'closed');

                    if (isString) {
                        var rowValue = row.domObject.value;
                        row.lastChild.firstChild.textContent = '"' + cropMultipleLines(rowValue, ZikulaBug.Tpl.Reps.StringMaxLenght) + '"';
                    } else {
                        var rowTag = this.varListRowTag;
                        var tbody = row.parentNode;

                        setTimeout(function()
                        {
                            for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling) {
                                if (parseInt(firstRow.getAttribute('level')) <= level) {
                                    break;
                                }
                                tbody.removeChild(firstRow);
                            }
                        }, row.insertTimeout ? row.insertTimeout : 0);
                    }
                } else {
                    removeClass(row, 'closed');
                    setClass(row, 'opened');

                    if (isString) {
                        var rowValue = row.domObject.value;
                        row.lastChild.firstChild.textContent = '"' + rowValue + '"';
                    } else {
                        var value = row.lastChild.firstChild.repObject;
                        var members = this.getVarListMembers(value, level+1);

                        var rowTag = this.varListRowTag;
                        var lastRow = row;

                        var delay = 0;
                        while (members.length) {
                            setTimeout(function(slice, isLast)
                            {
                                if (lastRow.parentNode) {
                                    lastRow = rowTag.insertRows({members: slice}, lastRow)[1];
                                }

                                if (isLast) {
                                    delete row.insertTimeout;
                                }
                            }, delay, members.splice(0, this.insertSliceSize), !members.length);

                            delay += this.insertInterval;
                        }

                        row.insertTimeout = delay;
                    }

                }
            },
            getVarListMembers: function(object, level) {
                if (!level) {
                    level = 0;
                }

                var ordinals = [], userProps = [], userClasses = [], userFuncs = [],
                    domProps = [], domFuncs = [], domConstants = [];

                try {
                    var domMembers = getDOMMembers(object) || {};

                    if (object.wrappedJSObject) {
                        var insecureObject = object.wrappedJSObject;
                    } else {
                        var insecureObject = object;
                    }

                    for (var name in insecureObject) {
                        if (ZikulaBug.Tpl.ignoreVars[name] == 1) {
                            continue;
                        }

                        var val;
                        try {
                            val = insecureObject[name];
                        } catch (exc) {}

                        var ordinal = parseInt(name);

                        if (ordinal || ordinal == 0) {
                            this.addVarListMember('ordinal', ordinals, name, val, level, insecureObject);
                        } else if (typeof(val) == 'function') {
                            if (this.isClassFunction(val)) {
                                this.addVarListMember('userClass', userClasses, name, val, level, insecureObject);
                            } else if (name in domMembers) {
                                this.addVarListMember('domFunction', domFuncs, name, val, level, domMembers[name], insecureObject);
                            } else {
                                this.addVarListMember('userFunction', userFuncs, name, val, level, insecureObject);
                            }
                        } else {
                            if (name in domMembers) {
                                this.addVarListMember('dom', domProps, name, val, level, domMembers[name], insecureObject);
                            } else if (name in domConstantMap) {
                                this.addVarListMember('dom', domConstants, name, val, level, insecureObject);
                            } else {
                                this.addVarListMember('user', userProps, name, val, level, insecureObject);
                            }
                        }
                    }
                } catch (exc) {}

                var members = [];
                members.push.apply(members, ordinals);

                if (Firebug.showUserProps) {
                    members.push.apply(members, userProps);
                }

                return members;
            },
            expandVarListMembers: function(members, toggles, offset, level) {
                var expanded = 0;
                for (var i = offset; i < members.length; ++i) {
                    var member = members[i];
                    if (member.level > level) {
                        break;
                    }
                    if (toggles.hasOwnProperty(member.name)) {
                        member.open = 'opened';

                        var newMembers = this.getVarListMembers(member.value, level+1);

                        var args = [i+1, 0];
                        args.push.apply(args, newMembers);
                        members.splice.apply(members, args);
                        expanded += newMembers.length;
                        i += newMembers.length + this.expandVarListMembers(members, toggles[member.name], i+1, level+1);
                    }
                }

                return expanded;
            },
            isClassFunction: function(fn) {
                try {
                    for (var name in fn.prototype) {
                        return true;
                    }
                } catch (exc) {}
                return false;
            },
            hasProperties: function(ob) {
                try {
                    for (var name in ob) {
                        if (ZikulaBug.Tpl.ignoreVars[name] == 1) {
                            continue;
                        }
                        return true;
                    }
                } catch (exc) {}
                return false;
            },
            hasChildren: function(value) {
                var valueType = typeof(value);
                var hasChildren = this.hasProperties(value) && !(value instanceof ErrorCopy) &&
                    (valueType == 'function' || (valueType == 'object' && value != null)
                    || (valueType == 'string' && value.length > ZikulaBug.Tpl.Reps.StringMaxLenght));
                return hasChildren;
            },
            addVarListMember: function(type, props, name, value, level, parent) {
                var rep = ZikulaBug.Tpl.getRep(value);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;
                var parentRep = ZikulaBug.Tpl.getRep(parent);
                var nameTag = parentRep.keyTag;

                var hasChildren = this.hasChildren(value);

                if((rep.className == 'array' || rep.className == 'object PHPArray') && value.length === 0) {
                    hasChildren = false;
                }

                props.push({
                    name: name,
                    nameTag: nameTag,
                    value: value,
                    type: type,
                    rowClass: 'memberRow-'+type,
                    open: 'closed',
                    level: level,
                    indent: level*16,
                    hasChildren: hasChildren,
                    tag: tag
                });
            }
        });

        // General template for browsing objects, based on FirebugReps
        ZikulaBug.Tpl.Var = domplate(ZikulaBug.Tpl.VarList, {
            varTag: TAG('$varCotnainer', {object: '$object|parseVarObject'}),
            varCotnainer: DIV({'class': 'varCotnainer', _item: '$object'},
                DIV({'class': 'zkOpener', onclick: '$onVarTogglerClick', visible: '$object.hasChildren'}, ''),
                DIV({'class': 'varTag $object.className', onclick: '$onVarClick'},
                    TAG('$varRep', {tag: '$object.tag', value: '$object.value'})
                )
            ),
            varRep: TAG('$tag', {object: '$value'}),
            parseVarObject: function(value) {
                var object = {
                        value: value,
                        className: ''
                    },
                    paramsRep = ZikulaBug.Tpl.getRep(value);
                object.tag = paramsRep.shortTag ? paramsRep.shortTag : paramsRep.tag;
                object.hasChildren = this.hasChildren(value);
                return object;
            },
            onVarTogglerClick: function(event) {
                if (!isLeftClick(event)) {
                    return;
                }
                cancelEvent(event);
                var row = getAncestorByClass(event.target, 'varCotnainer');
                this.toggleVarRow(row);
            },
            onVarClick: function(event) {
                if (!isLeftClick(event)) {
                    return;
                }
                cancelEvent(event);
                var row = getAncestorByClass(event.target, 'varCotnainer'),
                    toggler = getChildByClass(row,'zkOpener');
                this.toggleVarRow(row);
            },
            toggleVarRow: function(row) {
                var toggler = getChildByClass(row,'zkOpener'),
                    objElement = getChildByClass(row,'varTag'),
                    obj = objElement.repObject || row.item.value,
                    rep = ZikulaBug.Tpl.getRep(obj);
                if (!hasClass(toggler, 'opened')) {
                    removeClass(toggler, 'closed');
                    setClass(toggler, 'opened');
                    if (typeof(obj) == 'string') {
                        this.varRep.replace({tag: rep.tag, value: obj}, objElement)
                    } else {
                        this.varListTag.append({object: obj}, objElement)
                    }
                } else {
                    removeClass(toggler, 'opened');
                    setClass(toggler, 'closed');
                    this.varRep.replace({tag: rep.shortTag || rep.tag, value: obj}, objElement)
                }
            }
        });

        // Template for General view
        ZikulaBug.Tpl.General = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: FOR('item', '$data|getItems',
                DIV({'class': 'definitionRow'},
                    DIV({'class': 'definitionLabel'}, '$item.name'),
                    DIV({'class': 'definitionValue'}, '$item.value')
                )
            ),
            getItems: function(data) {
                var items = [
                    {name: $ZB_STR('ZikulaBug.ZikulaVersion'), value: data.version},
                    {name: $ZB_STR('ZikulaBug.ZikulaBugVersion'), value: data.addonVersion},
                    {name: $ZB_STR('ZikulaBug.MemoryUsage'), value: this.parseMemory(data.memory, true)},
                    {name: $ZB_STR('ZikulaBug.PageRenderTime'), value: this.parseTime(data.renderTime, true)},
                    {name: $ZB_STR('ZikulaBug.SqlQueries'), value: data.sqlCount},
                    {name: $ZB_STR('ZikulaBug.SqlQueriesTime'), value: this.parseTime(data.sqlTime, true)},
                ];
                return items;
            }
        });

        // Template for Config view
        ZikulaBug.Tpl.Config = domplate(ZikulaBug.Tpl.VarList, {
            render: function(data, node, context) {
                var obj = {};
                for (var prop in data) {
                    obj[data[prop].title] = data[prop].content;
                }

                this.varListTag.append({object: obj}, node, context);
            }
        });

        // Template for Queries view
        ZikulaBug.Tpl.Sql = domplate(ZikulaBug.Tpl.BaseRep, {
            table: TABLE({'class': 'sqlTable', width: '100%', cellspacing: 0, cellpadding: 0},
                THEAD(
                    TR({'class':'headerRow'},
                        TD({width:'95%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Query'))
                        ),
                        TD({width:'5%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Time.ms'))
                        )
                    )
                ),
                TAG('$data|getBody', {'data':'$data', 'general': '$general'})
            ),
            tableBody: TBODY(
                FOR('item', '$data',
                    TR({'class': 'contentRow'},
                        TD({'class': 'tableCell queryStr'},
                            DIV({'class': 'tableCellBox'},
                                FOR('token','$item.query|getQueryTokens',
                                    SPAN({'class': '$token.className'},'$token.content ')
                                )
                            )
                        ),
                        TD({'class': 'tableCell queryTime dataNum'},
                            DIV({'class': 'tableCellBox'}, '$item.time|parseTime')
                        )
                    )
                ),
                TR({'class': 'summaryRow'},
                    TD({'class': 'tableCell queryStr'},
                        DIV({'class': 'tableCellBox'}, $ZB_STRF('ZikulaBug.QueriesCount', ['$general.sqlCount']))
                    ),
                    TD({'class': 'tableCell queryTime dataNum'},
                        DIV({'class': 'tableCellBox'},'$general.sqlTime|parseTime')
                    )
                )
            ),
            tableEmpty: TBODY(
                TR({'class': 'contentRow typeEmpty'},
                    TD({colspan: '2', 'class': 'tableCell'},
                        DIV({'class': 'tableCellBox'}, $ZB_STR('ZikulaBug.NoSqlItems'))
                    )
                )
            ),
            getBody: function(data) {
                if (data.length > 0) {
                    return this.tableBody;
                } else {
                    return this.tableEmpty;
                }
            },
            getQueryTokens: function(query) {
                var tokens = [],
                    queryArr = query.split(' '),
                    tags = ['SELECT',' UPDATE', 'INSERT', 'DELETE', 'SET', 'FROM', 'LEFT JOIN', 'INNER JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET'],
                    tagsInline = ['AS', 'IN', 'ON', 'AND', 'OR'];

                for (var i = 0, limit = queryArr.length; i < limit; i++) {
                    if (!queryArr[i]) continue;
                    var item = {
                        content: queryArr[i],
                        className: ''
                    };
                    if (tags.indexOf(queryArr[i]) >= 0) {
                        item.className = 'queryKeywordBlock';
                    } else if (tagsInline.indexOf(queryArr[i]) >= 0) {
                        item.className = 'queryKeywordInline';
                    }
                    tokens.push(item);
                }
                return tokens;
            }
        });

        // Template for Templates view
        ZikulaBug.Tpl.View = domplate(ZikulaBug.Tpl.VarList, {
            render: function(data, node, context) {
                var obj = {};
                for (var i = 0, limit = data.length; i < limit; i++){
                    var item = data[i],
                        name = item.module ? item.template + ' (' + item.module + ')' : item.template;
                    obj[name] = item.vars;
                }
                this.varListTag.append({object: obj}, node, context);

            }
        });

        // Template for Functions view
        ZikulaBug.Tpl.Exec = domplate(ZikulaBug.Tpl.Var, {
            table: TABLE({'class': 'execTable', width: '100%', cellspacing: 0, cellpadding: 0},
                THEAD(
                    TR({'class':'headerRow'},
                        TD({width:'25%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'},  $ZB_STR('ZikulaBug.Function'))
                        ),
                        TD({width:'35%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'},  $ZB_STR('ZikulaBug.Arguments'))
                        ),
                        TD({width:'35%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'},  $ZB_STR('ZikulaBug.ReturnedData'))
                        ),
                        TD({width:'5%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'},  $ZB_STR('ZikulaBug.Time.ms'))
                        )
                    )
                ),
                TAG('$data|getBody', {'data':'$data'})
            ),
            tableBody: TBODY(
                FOR('item', '$data|getMembers',
                    TR({'class': 'contentRow'},
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox', style: 'padding-left: $item.indent\\px'},
                                DIV({'class': 'itemName'}, '$item.name'))
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox', _domObject: '$item.args'},
                                TAG('$varTag', {object: '$item.args'})
                            )
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox', _domObject: '$item.data'},
                                TAG('$varTag', {object: '$item.data'})
                            )
                        ),
                        TD({'class': 'tableCell dataNum'},
                            DIV({'class': 'tableCellBox'}, '$item.time|parseTime')
                        )
                    )
                )
            ),
            tableEmpty: TBODY(
                TR({'class': 'contentRow typeEmpty'},
                    TD({colspan: '4', 'class': 'tableCell'},
                        DIV({'class': 'tableCellBox'}, $ZB_STR('ZikulaBug.NoExexItems'))
                    )
                )
            ),
            getBody: function(data) {
                if (data.length > 0) {
                    return this.tableBody;
                } else {
                    return this.tableEmpty;
                }
            },
            getMembers: function(object) {
                var members = [];

                for (var i = 0, limit = object.length; i < limit; i++){
                    var item = object[i];
                    item.name = item.module +'/' + item.type + item.api + '/' + item.func;
                    item.indent = item.level * 16 + 5;
                    members.push(item);
                }

                return members;
            }
        });

        // Template for Logs view
        ZikulaBug.Tpl.Logs = domplate(ZikulaBug.Tpl.Var, {
            table: TABLE({'class': 'logsTable', width: '100%', cellspacing: 0, cellpadding: 0},
                THEAD(
                    TR({'class':'headerRow'},
                        TD({width:'10%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Type'))
                        ),
                        TD({width:'55%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Message'))
                        ),
                        TD({width:'35%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.FileLine'))
                        )
                    )
                ),
                TAG('$data|getBody', {'data':'$data'})
            ),
            tableBody: TBODY(
                FOR('item', '$data|getMembers',
                    TR({'class': 'contentRow $item.className'},
                        TD({'class': 'tableCell logType'},
                            DIV({'class': 'tableCellBox'}, '$item.typeName')
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class':'tableCellBox'},
                                DIV({'class': 'zkOpener', onclick: '$onItemTraceClick', _item: '$item'}, ''),
                                DIV({'class': 'itemMessage'}, '$item.errstr'),
                                DIV({'class': 'itemTrace'}, '')
                            )
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox logsWhere', _domObject: '$item.where'},
                                TAG('$varTag', {object: '$item.where'})
                            )
                        )
                    )
                )
            ),
            tableEmpty: TBODY(
                TR({'class': 'contentRow logRow-debug typeEmpty'},
                    TD({colspan: '3', 'class': 'tableCell'},
                        DIV({'class': 'tableCellBox'}, $ZB_STR('ZikulaBug.NoLogsItems'))
                    )
                )
            ),
            traceInfoRow: TR({'class': 'infoRow'},
                TD({'class': 'infoCol', colspan: 3})
            ),
            traceInfoBody: DIV({'class': 'infoBody'},
                DIV({'class': 'infoTabs'},
                    A({'class': 'infoValueTab infoTab', 'selected' : true}, $ZB_STR('ZikulaBug.Backtrace'))
                ),
                DIV({'class': 'infoValueText infoText'},
                    TAG('$traceTable', {'data':'$data'})
                )
            ),
            traceTable: TABLE({'class': 'logsTraceTable', width: '100%', cellspacing: 0, cellpadding: 0},
                THEAD(
                    TR({'class':'headerRow'},
                        TD({width:'15%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Function'))
                        ),
                        TD({width:'50%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.Arguments'))
                        ),
                        TD({width:'35%','class': 'headerCell'},
                            DIV({'class': 'headerCellBox'}, $ZB_STR('ZikulaBug.FileLine'))
                        )
                    )
                ),
                TAG('$traceTableBody', {'data':'$data'})
            ),
            traceTableBody: TBODY(
                FOR('item', '$data|getTraceMembers',
                    TR({'class': 'contentRow'},
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox'}, '$item.name')
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox logsTraceArgs', _domObject: '$item.args'},
                                TAG('$varTag', {object: '$item.args'})
                            )
                        ),
                        TD({'class': 'tableCell'},
                            DIV({'class': 'tableCellBox logsTraceWhere', _domObject: '$item.where'},
                                TAG('$varTag', {object: '$item.where'})
                            )
                        )
                    )
                )
            ),
            getBody: function(data) {
                if (data.length > 0) {
                    return this.tableBody;
                } else {
                    return this.tableEmpty;
                }
            },
            getMembers: function(object) {
                var members = [],
                    realpath = this.getPanel().getPanelData('meta.realpath');

                for (var i = 0, limit = object.length; i < limit; i++){
                    var item = object[i];
                    item.where = '';
                    if (item.errline && item.errfile) {
                        item.where = item.errfile + ':' + item.errline;
                    } else if (item.trace && item.trace[2]) {
                        item.where = item.trace[2].file + ':' + item.trace[2].line;
                    }
                    item.where = item.where.replace(realpath,'');
                    switch(item.type) {
                        case 0:
                            item.className = 'logRow-errorMessage typeEmergency';
                            item.typeName = 'Emergency';
                            break;
                        case -1:
                            item.className = 'logRow-errorMessage typeAlert';
                            item.typeName = 'Alert';
                            break;
                        case -2:
                            item.className = 'logRow-errorMessage typeCritical';
                            item.typeName = 'Critical';
                            break;
                        case -3:
                            item.className = 'logRow-errorMessage typeError';
                            item.typeName = 'Error';
                            break;
                        case -4:
                            item.className = 'logRow-warn typeWarning';
                            item.typeName = 'Warning';
                            break;
                        case -5:
                            item.className = 'logRow-info typeNotice';
                            item.typeName = 'Notice';
                            break;
                        case -6:
                            item.className = 'logRow-info typeInformational';
                            item.typeName = 'Informational';
                            break;
                        case -7:
                        default:
                            item.className = 'logRow-debug typeDebug';
                            item.typeName = 'Debug';
                            break;
                    }

                    members.push(item);
                }

                return members;
            },
            getTraceMembers: function(object) {
                var members = [],
                    realpath = this.getPanel().getPanelData('meta.realpath');

                for (var i in object){
                    var item = object[i];
                    item.where = '';
                    if (item.file && item.line) {
                        item.where = item.file + ':' + item.line;
                    }
                    item.where = item.where.replace(realpath,'');
                    item.name = item['class'] ? item['class'] + item.type + item['function'] : item['function'];
                    members.push(item);
                }

                return members;
            },
            onItemTraceClick: function(event) {
                if (!hasClass(event.target, 'zkOpener')) {
                    return;
                }
                var row = getAncestorByClass(event.target, 'contentRow');
                if (hasClass(event.target, 'opened')) {
                    removeClass(event.target, 'opened');
                    row.parentNode.removeChild(row.nextSibling);
                } else {
                    setClass(event.target, 'opened');
                    var infoRow = this.traceInfoRow.insertRows({}, row)[0],
                        infoCol = getElementByClass(infoRow, 'infoCol'),
                        item = event.target.item;
                    item.trace = item.trace || {};
                    this.traceInfoBody.replace({data: item.trace}, infoCol);
                }
            }
        });
        // Template for HTTP request view
        ZikulaBug.Tpl.Request = domplate(ZikulaBug.Tpl.VarList, {
            render: function(data, node, context) {
                if (data.cookie) {
                    for (prop in data.cookie) {
                        try {
                            var decoded = JSON.parse(decodeURI(decodeURI(data.cookie[prop]))),
                                orginal = data.cookie[prop];
                            data.cookie[prop] = {};
                            data.cookie[prop][$ZB_STR('ZikulaBug.OrginalCookie')] = orginal;
                            data.cookie[prop][$ZB_STR('ZikulaBug.DecodedCookie')] = decoded;
                        } catch (e) {}
                    }
                }
                this.varListTag.append({object: data}, node, context);
            }
        });

        // Template for Settings view
        ZikulaBug.Tpl.Settings = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: DIV(
                P($ZB_STR('ZikulaBug.SettingsIntro')),
                TAG('$data|getCurrentItemTag', {item: '$data|getCurrentItem', className: 'currentHost'}),
                DIV({'class': 'otherHosts closed'},
                    DIV({'class':'controlls'},
                        A({'class': 'showOtherHosts', onclick:'$toggleRow'}, $ZB_STR('ZikulaBug.ShowOtherHosts')),
                        A({'class': 'hideOtherHosts', onclick:'$toggleRow'}, $ZB_STR('ZikulaBug.HideOtherHosts'))
                    ),
                    DIV({'class': 'otherHostsInner'},
                        FOR('item', '$data|getItems',
                            TAG('$itemRow', {item: '$item', className: 'otherHost'})
                        )
                    )
                )
            ),
            itemRow: DIV({'class': 'definitionRow $className'},
                DIV({'class': 'definitionLabel'}, '$item.name'),
                DIV({'class': 'definitionValue'},
                    INPUT({type: 'text', 'class': 'prefValue', name: '$item.name', value: '$item.value'}),
                    A({'class': 'settingsControll save', onclick: '$savePref'}, $ZB_STR('ZikulaBug.Save')),
                    A({'class': 'settingsControll clear', onclick: '$clearPref'}, $ZB_STR('ZikulaBug.Clear')),
                    A({'class': 'settingsControll delete', onclick: '$deletePref'}, $ZB_STR('ZikulaBug.Delete'))
                )
            ),
            emptyRow: DIV(''),
            getCurrentItemTag: function() {
                if (this.getPanel().getPanelData('meta.baseURL')) {
                    return this.itemRow;
                } else {
                    return this.emptyRow;
                }
            },
            getCurrentItem: function(data) {
                var baseURL = this.getPanel().getPanelData('meta.baseURL') || '';
                return {
                    name: this.getHost(baseURL) || '',
                    value: baseURL ? (data[this.getHost(baseURL)] || '') : ''
                }
            },
            getItems: function(data) {
                var baseURL = this.getPanel().getPanelData('meta.baseURL') || '',
                    currentHost = this.getHost(baseURL),
                    items = [];
                for (var prop in data) {
                    if (prop == currentHost) {
                        continue;
                    }
                    var obj = {
                        name: prop,
                        value: data[prop] || ''
                    }
                    items.push(obj);
                }
                return items;
            },
            toggleRow: function(event) {
                var parent = getAncestorByClass(event.target, 'otherHosts'),
                    row = getChildByClass(parent, 'otherHostsInner');
                toggleClass(parent, 'closed')
            },
            savePref: function(event) {
                cancelEvent(event);
                var row = getAncestorByClass(event.target, 'definitionValue'),
                    input = getChildByClass(row,'prefValue'),
                    prefs = this.getPrefs('secKey') || {};
                prefs[input.name] = input.value;
                this.setPrefs('secKey', prefs);
            },
            clearPref: function(event) {
                cancelEvent(event);
                var row = getAncestorByClass(event.target, 'definitionValue'),
                    input = getChildByClass(row,'prefValue'),
                    prefs = this.getPrefs('secKey') || {};
                prefs[input.name] = '';
                this.setPrefs('secKey', prefs);
                input.value = '';
            },
            deletePref: function(event) {
                cancelEvent(event);
                var row = getAncestorByClass(event.target, 'definitionValue'),
                    input = getChildByClass(row,'prefValue'),
                    definitionRow = getAncestorByClass(row, 'definitionRow'),
                    prefs = this.getPrefs('secKey') || {};
                delete prefs[input.name];
                this.setPrefs('secKey', prefs);
                definitionRow.parentNode.removeChild(definitionRow);
            }
        });

        // Firebug Panel
        ZikulaBug.Panel = function() {}
        ZikulaBug.Panel.prototype = extend(Firebug.ActivablePanel, {
            name: 'ZikulaBugPanel',
            title: 'Zikula',
            searchable: false,

            data: null,
            meta: {},
            activeView: 'General',

            getDataByPath: function(key, source) {
                if (!source) {
                    return null;
                }
                if (!key) {
                    return source;
                }
                key = key.split('.');
                var x = source;
                for (var i=0, limit=key.length; i<limit; i++) {
                        x = x[key[i]] || null;
                        if (!x) return x;
                    }
                return x;
            },
            getWrappedData: function(key) {
                key = key || ['Zikula'];
                return this.getDataByPath(key, this.context.window.wrappedJSObject);
            },
            getPanelData: function(key) {
                return this.getDataByPath(key, this);
            },
            loadData: function() {
                fdump('ZikulaBug.Panel.loadData');
                this.data = this.getWrappedData('Zikula.DebugToolbarData') || null;
                this.meta.baseURL = this.getWrappedData('Zikula.Config.baseURL') || ''
                if (this.data) {
                    this.data.general = {
                        version: this.data.version.content,
                        addonVersion: ZikulaBug.Meta.version,
                        memory: this.data.memory.content,
                        renderTime: this.data.rendertime.content,
                        sqlCount: this.data.sql.content.length
                    };
                    this.meta.realpath = this.data.__meta.realpath;
                    this.data.general.sqlTime = 0;
                    for (var i = 0, limit = this.data.sql.content.length; i < limit; i++){
                        this.data.general.sqlTime += this.data.sql.content[i].time;
                    }
                }
                return this.data;
            },
            initialize: function(context, doc) {
                fdump('ZikulaBug.Panel.initialize');
                Firebug.ActivablePanel.initialize.apply(this, arguments);
                this.loadData();
            },
            getBody: function(id, title) {
                fdump('ZikulaBug.Panel.getBody');
                return ZikulaBug.Tpl.MainTag.tag.replace({'id': id}, this.panelNode, null);
            },
            display: function() {
                fdump('ZikulaBug.Panel.display');
                if (!this.context.loaded || this.panelNode.querySelector('div#'+this.activeView.toLowerCase())) {
                    return;
                }
                this.panelNode.innerHTML = '';
                if (this.data == null && !this.loadData() && this.activeView != 'Settings') {
                    this.displayNullInfo();
                    return;
                }
//                dump('this.panelNode', this.panelNode, this);
                this['display' + this.activeView]();
            },
            displayGeneral: function() {
                fdump('ZikulaBug.Panel.displayGeneral');
                var data = this.data.general,
                    body = this.getBody('general', 'General');
                ZikulaBug.Tpl.General.tag.append({'data': data}, body, null);
            },
            displayConfig: function() {
                fdump('ZikulaBug.Panel.displayConfig');
                var data = this.data.config.content,
                    body = this.getBody('config', 'Configuration');
                ZikulaBug.Tpl.Config.render(data, body);
            },
            displaySql: function() {
                fdump('ZikulaBug.Panel.displaySql');
                var data = this.data.sql.content,
                    general = this.data.general,
                    body = this.getBody('sql', 'SQL Queries');
                ZikulaBug.Tpl.Sql.table.append({'data': data, 'general': general}, body, null);
            },
            displayView: function() {
                fdump('ZikulaBug.Panel.displayView');
                var data = this.data.view.content,
                    body = this.getBody('view', 'Templates');
                ZikulaBug.Tpl.View.render(data, body);
            },
            displayExec: function() {
                fdump('ZikulaBug.Panel.displayExec');
                var data = this.data.exec.content,
                    body = this.getBody('exec', 'Functions executions');
                ZikulaBug.Tpl.Exec.table.append({'data': data}, body);
            },
            displayLogs: function() {
                fdump('ZikulaBug.Panel.displayLogs');
                var data = this.data.logs.content,
                    body = this.getBody('logs', 'Log console');
                ZikulaBug.Tpl.Logs.table.append({'data': data}, body, null);
            },
            displayRequest: function() {
                fdump('ZikulaBug.Panel.displayRequest');
                var data = this.data.http_request,
                    body = this.getBody('request', 'HTTP request');
                ZikulaBug.Tpl.Request.render(data, body);
            },
            displaySettings: function() {
                fdump('ZikulaBug.Panel.displaySettings');
                var data = ZikulaBug.Util.getPrefs('secKey') || {},
                    body = this.getBody('settings', 'Settings');
                ZikulaBug.Tpl.Settings.tag.append({data: data}, body, null);
            },
            displayNullInfo: function() {
                fdump('ZikulaBug.Panel.displayNullInfo');
                ZikulaBug.Tpl.Info.tag.replace({'id': 'nullInfo', 'title': $ZB_STR('ZikulaBug.NoData'), 'info': $ZB_STR('ZikulaBug.NoDataInfo')}, this.panelNode, null);
            },
            onActivationChanged: function(enable) {
                fdump('ZikulaBug.Panel.onActivationChanged');
                if (enable) {
                    Firebug.ZikulaBugModel.addObserver(this);
                } else {
                    Firebug.ZikulaBugModel.removeObserver(this);
                }
            },
            getOptionsMenuItems: function(context)    {
                return [{
                    label: $ZB_STR('ZikulaBug.About'),
                    nol10n: true,
                    type: 'radio',
                    command: Firebug.ZikulaBugModel.showAboutDialog
                },{
                    label: $ZB_STR('ZikulaBug.Help'),
                    nol10n: true,
                    type: 'radio',
                    command: Firebug.ZikulaBugModel.showHelp
                }];
            }
        });

        // Firebug Model
        Firebug.ZikulaBugModel = extend(Firebug.ActivableModule, {
            defaultView: 'general',

            initialize: function() {
                fdump('ZikulaBugModel.initialize');
                Firebug.ActivableModule.initialize.apply(this, arguments);
            },
            getPanel: function(context) {
                fdump('ZikulaBugModel.getPanel');
                context = context || Firebug.currentContext;
                return context.getPanel('ZikulaBugPanel');
            },
            showPanel: function(browser, panel) {
                var isZikulaBug = panel && panel.name == 'ZikulaBugPanel';
                if (isZikulaBug) {
                    fdump('ZikulaBugModel.showPanel');
                    var ZikulaBugButtons = Firebug.chrome.$('fbZikulaBugButtons');
                    collapse(ZikulaBugButtons, false);
                    this.setActiveView(null, null, ZikulaBugButtons);
                }
            },
            setActiveView: function(context, view, ZikulaBugButtons) {
                fdump('ZikulaBugModel.setActiveView');
                if (!view && ZikulaBugButtons) {
                    view = this.getPanel(context).activeView;
                    ZikulaBugButtons.querySelector('[id=fbZikulaBug-'+ view +']').checked = true;
                } else if (view) {
                    this.getPanel(context).activeView = view;
                }

                this.getPanel(context).display();
            },
            showAboutDialog: function() {
                AddonManager.getAddonByID(ZikulaBug.Meta.id, function(addon) {
                    openDialog('chrome://mozapps/content/extensions/about.xul', '',
                    'chrome,centerscreen,modal', addon);
                });
            },
            showHelp: function() {
                AddonManager.getAddonByID(ZikulaBug.Meta.id, function(addon) {
                    openNewTab(addon.homepageURL);
                });
            },
            onObserverChange: function(observer) {
                fdump('ZikulaBugModel.onObserverChange');
                if (this.hasObservers()) {
                    ZikulaBug.httpRequestObserver.register();
                } else {
                    ZikulaBug.httpRequestObserver.unregister();
                }
            }
        });

        // debug
        function dump() {
//            return;
             Firebug.Console.log(arguments);
        }
        function fdump() {
            return;
            var name = arguments[0],
                args = fdump.caller.arguments;
            Firebug.Console.log(['FDUMP: ' +name, args]);
        }

        Firebug.registerPanel(ZikulaBug.Panel);
        Firebug.registerActivableModule(Firebug.ZikulaBugModel);

        Firebug.registerStylesheet('chrome://ZikulaBug/skin/ZikulaBug.css');

    }
});
