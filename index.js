/**
 * 作用域及脏值查询部分
 *  功能：监控表达式
 *      在每次$digest时执行所有表达式直到值稳定
 *      在表达式值变化时调用其回调函数
 *
 */

var Scope = function () {
    //用于存放监听器的监听器池
    this.$$watchers = [];
    //需要延迟加载的队列
    this.$$asyncQueue = [];
}

//注册监听器
Scope.prototype.$watch = function (watchFn, listenerFn, strictMode) {
    listenerFn = listenerFn || function () {
        };
    var watcher = {watchFn: watchFn, listenerFn: listenerFn};
    this.$$watchers.push(watcher);
}

//遍历监听器池一次
Scope.prototype.$$digestOnce = function () {
    var that = this;
    var dirty;
    this.$$watchers.forEach(function (watcher) {
        var newVal = watcher.watchFn();
        var oldVal = watcher.last;
        if (newVal !== oldVal) {
            watcher.listenerFn(newVal, oldVal, that);
            dirty = true;
        }
        watcher.last = newVal;
    })
    return dirty;
}

//循环遍历监听池
Scope.prototype.$digest = function () {
    var dirty;
    //脏值查询最大次数
    var time = 10;
    do {
        while (this.$$asyncQueue.length) {
            var task = this.$$asyncQueue.shift();
            this.$eval(task.expression);
        }
        dirty = this.$$digestOnce();
        if (dirty && !(time--)) {
            throw '达到脏值检查上限' + time + '次';
        }
    } while (dirty);
}

/**
 * 在作用域中执行外部函数
 * @param fn 要执行的函数
 * @param locals 传递的参数
 * @returns fn的返回值
 */
Scope.prototype.$eval = function (fn, locals) {
    return fn(this, locals);
}

/**
 * 在作用域中执行外部函数并触发脏值查询
 * @param fn 要执行的函数
 */
Scope.prototype.$apply = function (fn) {
    try {
        this.$eval(fn);
    } finally {
        this.$digest();
    }
}

/**
 * 将需要延迟加载的函数推入队列
 * @param fn
 */
Scope.prototype.$evalAsync = function (fn) {
    this.$$asyncQueue.push({scope: this, expression: fn});
}


/*
 * provider
 *   包括原生angular中的 $provider 和 $injector
 *   功能：
 *       注册组件（directives services controller）
 *       解决各个组件之间的依赖关系
 *       初始化所有组件
 * */

//首先注册组件。也就是将组件名和对应工厂函数对应。 通过组件名查找缓存，如果已经有初始化的service则返回，
// 如果没有看该组件是否注册，如果注册过 将 其对应的工厂函数和依赖初始化 并存入缓存
//初始化过程就是通过工厂函数 匹配出依赖的组件名，在依赖列表中找该组件，找到就存在deps中，没找到就初始化该依赖。最后返回该工厂函数，初始化的依赖作为参数传入

var Provider = {
    _providers: {},
    _cache: {
        $rootScope: new Scope()
    },
    directive: function (name, fn) {
        return this._register(name + Provider.DIRECTIVE_SUFFIX, fn);
    },
    service: function (name, fn) {
        return this._register(name + Provider, fn);
    },

    //可以多次事例化同一个controller而不会缓存返回的值
    controller: function (name, fn) {
        this._register(name, function () {
            return fn;
        })
    },
    _register: function (name, factory) {
        this._providers[name] = factory;
    },

    //通过名称 本地依赖 返回对应的service
    get: function (name, locals) {
        if (this._cache[name]) {
            return this._cache[name];
        }
        var provider = this._providers[name];
        if (!provider || typeof provider !== 'function') {
            return null;
        }
        return (this._cache[name] = this.invoke(provider, locals));
    },

    //通过service对应的工厂函数 本地依赖 初始化service
    invoke: function (fn, locals) {
        locals = locals || {};
        var deps = this.annotate(fn).map(function (s) {
            return locals[s] || this.get(s, locals);
        }, this);
        return fn.apply(null, deps);
    },

    //返回一个数组 数组是当前service依赖的模块的名称
    annotate: function (fn) {
        var res = fn.toString()
            .replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg, '')
            .match(/\((.*?)\)/);
        if (res && res[1]) {
            return res[1].split(',').map(function (d) {
                return d.trim();
            });
        }
        return [];
    }
}

/*
 * compiler
 *   编译器 支持解析DOM元素上的directive，并给他提供scope，并调用其link函数
 *   功能：
 *      遍历DOM节点
 *      找到注册的属性类型的directive
 *      调用其对应的link函数
 *      管理scope
 * */

var DOMCompiler = {

    //用来启动整个项目
    bootstrap: function () {
        this.compile(Document.children[0],Provider.get('$rootScope'));
    },

    //执行依附于当前html节点上指令的代码，并且递归执行子元素
    compile: function (el,scope) {
        var dirs=this._getElDirectives(el),
            dir,
            scopeCreated;
        dirs.forEach(function (d) {
            dir=Provider.get(d.name+Provider.DIRECTIVE_SUFFIX);
            if (dir.scope && !scopeCreated) {
                scope=scope.$new();
                scopeCreated=true;
            }
            dir.link(el,scope,d.value);
        })
        Array.prototype.slice.call(el.children).forEach(function (c) {
            this.compile(c,scope);
        },this);

    },

    //获取 属性类型的指令及其参数
    _getElDirectives: function (ele) {
        var attrs=ele.attributes,
            result=null;
        for (var i=0;i<attrs.length;i++) {
            if (Provider.get(attrs[i].name+Provider.DIRECTIVE_SUFFIX)) {
                result.push({
                    name: attrs[i].name,
                    value: attrs[i].value
                })
            }
        }
        return result;
    }
}

/*
* Scope
* 
* */

function Scope (parent,id) {
    this.$$watchers=[];
    this.$$children=[];
    this.$parent= parent;
    this.$id=id || 0;
}
Scope.counter=0;

Scope.prototype.$watch=function (exp,fn) {
    this.$$watchers.push({
        exp:exp,
        fn:fn,
        last:Utils.clone(this.$eval(exp))
    })
}

Scope.prototype.$new=function () {
    Scope.counter++;
    var obj=new Scope(this,Scope.counter);
    Object.setPrototypeOf(obj,this);
    this.$$children.push(obj);
    return obj;
}

Scope.prototype.$destory=function () {
    var pc=this.$parent.$$children;
    pc.splice(pc.indexOf(this),1);
}


