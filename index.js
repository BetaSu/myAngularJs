var Scope=function  () {
    //用于存放监听器的监听器池
    this.$$watchers=[];
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
        dirty=this.$$digestOnce();
        if (dirty && !(time--)) {
            throw '达到脏值检查上限'+time+'次';
        }
    } while (dirty);
}