// js-cookie shim for browser
const Cookies = {
	get(name?: string) {
		if (!name) {
			const all: Record<string, string> = {};
			document.cookie.split(';').forEach((c) => {
				const [k, ...v] = c.trim().split('=');
				if (k) all[k] = v.join('=');
			});
			return all;
		}
		const match = document.cookie.match(
			new RegExp(
				'(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)',
			),
		);
		return match ? decodeURIComponent(match[1]) : undefined;
	},
	set(name: string, value: string, options?: any) {
		let cookie = `${name}=${encodeURIComponent(value)}`;
		if (options?.path) cookie += `; path=${options.path}`;
		if (options?.domain) cookie += `; domain=${options.domain}`;
		if (options?.expires)
			cookie += `; expires=${options.expires.toUTCString?.() || options.expires}`;
		if (options?.secure) cookie += '; secure';
		document.cookie = cookie;
	},
	remove(name: string, options?: any) {
		Cookies.set(name, '', { ...options, expires: new Date(0) });
	},
};

export default Cookies;
