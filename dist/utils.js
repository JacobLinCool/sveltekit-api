export function recursive_await(obj) {
    if (obj instanceof Promise) {
        return obj.then(recursive_await);
    }
    else if (obj instanceof Array) {
        return Promise.all(obj.map(recursive_await));
    }
    else if (obj !== null &&
        typeof obj === "object" &&
        (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null)) {
        const keys = Object.keys(obj);
        const values = Object.values(obj);
        return Promise.all(values.map(recursive_await)).then((values) => {
            const returns = {};
            for (let i = 0; i < keys.length; i++) {
                returns[keys[i]] = values[i];
            }
            return returns;
        });
    }
    else {
        return obj;
    }
}
