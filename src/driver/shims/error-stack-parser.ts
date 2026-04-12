// error-stack-parser shim
const errorStackParser = {
	parse(error: Error) {
		const stack = error.stack?.split('\n').slice(1) || [];
		return stack.map((line) => ({
			fileName: '',
			functionName: line.trim(),
			lineNumber: 0,
			columnNumber: 0,
			source: line,
		}));
	},
};

export default errorStackParser;
