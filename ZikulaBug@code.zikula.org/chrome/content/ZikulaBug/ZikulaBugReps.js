FBL.ns(function() {
    with (FBL) {
        ZikulaBug = top.ZikulaBug;
        ZikulaBug.Tpl.Reps = {};

        var OBJECTBOX = FirebugReps.OBJECTBOX;
        var OBJECTBLOCK = FirebugReps.OBJECTBLOCK;
        var OBJECTLINK = FirebugReps.OBJECTLINK;

        ZikulaBug.Tpl.Reps.StringMaxLenght = 50;
        ZikulaBug.Tpl.Reps.ObjectShortIteratorMax = 2;

        ZikulaBug.Tpl.Reps.PHPString = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: OBJECTBOX('&quot;$object&quot;'),
            shortTag: OBJECTBOX('&quot;$object|crop&quot;'),
            crop: function(text) {
                return cropMultipleLines(text, ZikulaBug.Tpl.Reps.StringMaxLenght);
            },
            className: 'string',
            supportsObject: function(object, type) {
                return type == 'string';
            }
        });

        ZikulaBug.Tpl.Reps.PHPNumber = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: OBJECTBOX('$object'),
            className: 'number',
            supportsObject: function(object, type) {
                return type == 'boolean' || type == 'number';
            }
        });

        ZikulaBug.Tpl.Reps.PHPClass = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: OBJECTLINK(
                SPAN({'class': 'objectTitle'}, '$object|getClassName Object '),
                SPAN({'class': 'objectLeftBrace', role: 'presentation'}, '('),
                FOR('prop', '$object|shortPropIterator',
                    ' $prop.name|getPropName',
                    SPAN({'class': 'objectEqual', role: 'presentation'}, '$prop.equal'),
                    TAG('$prop.tag', {object: '$prop.object'}),
                    SPAN({'class': 'objectComma', role: 'presentation'}, '$prop.delim')
                ),
                SPAN({'class': 'objectRightBrace'}, ')')
            ),
            shortTag: OBJECTLINK(
                SPAN({'class': 'objectTitle'}, '$object|getClassName Object '),
                SPAN({'class': 'objectLeftBrace', role: 'presentation'}, '('),
                FOR('prop', '$object|shortPropIterator',
                    ' $prop.name|getPropName',
                    SPAN({'class': 'objectEqual', role: 'presentation'}, '$prop.equal'),
                    TAG('$prop.tag', {object: '$prop.object'}),
                    SPAN({'class': 'objectComma', role: 'presentation'}, '$prop.delim')
                ),
                SPAN({'class': 'objectRightBrace'}, ')')
            ),
            titleTag: SPAN({'class': 'objectTitle'}, '$object|getTitleTag'),
            keyTag: SPAN({'class': 'classProperty $object|getPropType', title: '$object|getPropType'}, '$object|getPropName'),
            getClassName: function(object) {
                return object.__phpClassName;
            },
            getTitleTag: function(object) {
                var title;
                if (typeof(object) == 'string') {
                    title = object;
                } else {
                    title = this.getClassName(object);
                }
                if (title == 'Object') {
                    title = '{...}';
                }
                return title;
            },
            getPropName: function(name) {
                return name.split(':').pop()
            },
            getPropType: function(name) {
                name = name.split(':');
                name.pop();
                return name.join(' ');
            },
            longPropIterator: function (object) {
                return this.propIterator(object,100);
            },
            shortPropIterator: function (object) {
                return this.propIterator(object, ZikulaBug.Tpl.Reps.ObjectShortIteratorMax);
            },
            propIterator: function (object, max) {
                max = max || 3;
                if (!object) {
                    return [];
                }
                var props = [], len = 0, count = 0;

                try {
                    for (var name in object) {
                        if (ZikulaBug.Tpl.ignoreVars[name] == 1) {
                            continue;
                        }
                        var value;
                        try {
                            value = object[name];
                        } catch (exc) {
                            continue;
                        }

                        var t = typeof(value);
                        if (t == 'boolean' || t == 'number' || (t == 'string' && value)
                            || (t == 'object' && value && value.toString)) {
                            var rep = ZikulaBug.Tpl.getRep(value),
                                tag = rep.shortTag || rep.tag;
                            if (t == 'object') {
                                value = rep.getTitle(value);
                                if (rep.titleTag) {
                                    tag = rep.titleTag;
                                } else {
                                    tag = FirebugReps.Obj.titleTag;
                                }
                            }
                            count++;
                            if (count <= max) {
                                props.push({tag: tag, name: name, object: value, equal: '=', delim: ', '});
                            } else {
                                break;
                            }
                        }
                    }
                    if (count > max) {
                        props[Math.max(1,max-1)] = {
                            object: $STR('ZikulaBug.Tpl.BaseReps.more') + '...',
                            tag: FirebugReps.Caption.tag,
                            name: '',
                            equal: '',
                            delim: ''
                        };
                    } else if (props.length > 0) {
                        props[props.length-1].delim = '';
                    }
                }
                catch (exc) {}
                return props;
            },
            className: 'object PHPClass',
            supportsObject: function(object, type) {
                return object && object.__phpClassName;
            }
        });

        ZikulaBug.Tpl.Reps.PHPArray = domplate(ZikulaBug.Tpl.BaseRep, {
            tag: OBJECTLINK(
                SPAN({'class': 'objectTitle'}, 'array '),
                SPAN({'class': 'objectLeftBrace', role: 'presentation'}, '('),
                FOR('prop', '$object|shortPropIterator',
                    SPAN({'class': 'objectBox-string', role : 'presentation'},'$prop.name|itemKey'),
                    SPAN({'class': 'objectEqual', role: 'presentation'}, '$prop.equal'),
                    TAG('$prop.tag', {object: '$prop.object'}),
                    SPAN({'class': 'objectComma', role: 'presentation'}, '$prop.delim')
                ),
                SPAN({'class': 'objectRightBrace'}, ')')
            ),
            shortTag: OBJECTLINK(
                SPAN({'class': 'objectTitle'}, 'array '),
                SPAN({'class': 'objectLeftBrace', role: 'presentation'}, '('),
                FOR('prop', '$object|shortPropIterator',
                    SPAN({'class': 'objectBox-string', role : 'presentation'},'$prop.name|itemKey'),
                    SPAN({'class': 'objectEqual', role: 'presentation'}, '$prop.equal'),
                    TAG('$prop.tag', {object: '$prop.object'}),
                    SPAN({'class': 'objectComma', role: 'presentation'}, '$prop.delim')
                ),
                SPAN({'class': 'objectRightBrace'}, ')')
            ),
            titleTag: SPAN({'class': 'objectTitle', title: '$object|itemsCount'}, '$object|getTitleTag'),
            keyTag: SPAN({'class': 'objectBox-string', role : 'presentation'},'$object|itemKey'),
            getTitleTag: function(object) {
                return Object.keys(object).length > 0 ? 'array(...)' : 'array()';
            },
            itemsCount: function(object) {
                return Object.keys(object).length + ' elements';
            },
            itemKey: function(name) {
                return name ? '[' + name + ']' : '';
            },
            longPropIterator: function (object) {
                return this.propIterator(object,100);
            },
            shortPropIterator: function (object) {
                return this.propIterator(object, ZikulaBug.Tpl.Reps.ObjectShortIteratorMax);
            },
            propIterator: function (object, max) {
                max = max || 3;
                if (!object) {
                    return [];
                }

                var props = [], len = 0, count = 0;

                try {
                    for (var name in object) {
                        if (ZikulaBug.Tpl.ignoreVars[name] == 1) {
                            continue;
                        }
                        var value;
                        try {
                            value = object[name];
                        } catch (exc) {
                            continue;
                        }

                        var t = typeof(value);
                        if (t == 'boolean' || t == 'number' || (t == 'string' && value)
                            || (t == 'object' && value && value.toString)) {
                            var rep = ZikulaBug.Tpl.getRep(value);
                            var tag = rep.shortTag || rep.tag;
                            if (t == 'object') {
                                if (rep.titleTag) {
                                    tag = rep.titleTag;
                                } else {
                                    tag = FirebugReps.Obj.titleTag;
                                }
                            }
                            count++;
                            if (count <= max) {
                                props.push({tag: tag, name: name, object: value, equal: '=>', delim: ', '});
                            } else {
                                break;
                            }
                        }
                    }
                    if (count > max) {
                        props[Math.max(1,max-1)] = {
                            object: $STR('ZikulaBug.Tpl.BaseReps.more') + '...',
                            tag: FirebugReps.Caption.tag,
                            name: '',
                            equal: '',
                            delim: ''
                        };
                    } else if (props.length > 0) {
                        props[props.length-1].delim = '';
                    }
                }
                catch (exc) {}
                return props;
            },
            className: 'object PHPArray',
            supportsObject: function(object, type) {
                return type == 'object';
            }
        });

        ZikulaBug.Reps.push(
            ZikulaBug.Tpl.Reps.PHPClass,
            ZikulaBug.Tpl.Reps.PHPNumber,
            ZikulaBug.Tpl.Reps.PHPString,
            ZikulaBug.Tpl.Reps.PHPArray
        );

        function dump() {
//            return;
             Firebug.Console.log(arguments);
        }

    }
});