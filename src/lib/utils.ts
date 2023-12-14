export function recursive_await(obj: unknown): unknown {
	if (obj instanceof Promise) {
		return obj.then(recursive_await);
	} else if (obj instanceof Array) {
		return Promise.all(obj.map(recursive_await));
	} else if (obj instanceof Object) {
		const keys = Object.keys(obj);
		const values = Object.values(obj);
		return Promise.all(values.map(recursive_await)).then((values) => {
			const returns: Record<string, unknown> = {};
			for (let i = 0; i < keys.length; i++) {
				returns[keys[i]] = values[i];
			}
			return returns;
		});
	} else {
		return obj;
	}
}
