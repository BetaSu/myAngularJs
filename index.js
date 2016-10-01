/**
 * 作用域及脏值查询部分
 *
 */

var Scope=function  () {
    //用于存放监听器的监听器池
    this.$$watchers=[];
    //需要延迟加载的队列
    this.$$asyncQueue=[];
}

//注册监听器
Scope.prototype.$watch=function  (watchFn,listenerFn,strictMode) {
    listenerFn=listenerFn ||function () {};
    var watcher={watchFn:watchFn,listenerFn:listenerFn};
    this.$$watchers.push(watcher);
}

//遍历监听器池一次
Scope.prototype.$$digestOnce=function  () {
    var that=this;
    var dirty;
    this.$$watchers.forEach(function (watcher) {
        var newVal=watcher.watchFn();
        var oldVal=watcher.last;
        if (newVal!==oldVal) {
            watcher.listenerFn(newVal,oldVal,that);
            dirty=true;
        }
        watcher.last=newVal;
    })
    return dirty;
}

//循环遍历监听池
Scope.prototype.$digest=function () {
    var dirty;
    //脏值查询最大次数
    var time=10;
    do {
        while (this.$$asyncQueue.length) {
            var task=this.$$asyncQueue.shift();
            this.$eval(task.expression);
        }
        dirty=this.$$digestOnce();
        if (dirty && !(time--)) {
            throw '达到脏值检查上限'+time+'次';
        }
    } while (dirty);
}

/**
 * 在作用域中执行外部函数
 * @param fn 要执行的函数
 * @param locals 传递的参数
 * @returns fn的返回值
 */
Scope.prototype.$eval=function  (fn,locals) {
    return fn(this,locals);
}

/**
 * 在作用域中执行外部函数并触发脏值查询
 * @param fn 要执行的函数
 */
Scope.prototype.$apply=function  (fn) {
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
Scope.prototype.$evalAsync=function  (fn) {
    this.$$asyncQueue.push({scope:this,expression:fn});
}




