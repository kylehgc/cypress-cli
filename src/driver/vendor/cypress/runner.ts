// Runner shim — minimal stub for browser mode
const $Runner = {
	create(_specWindow: any, _mocha: any, _Cypress: any, _cy: any, _state: any) {
		return {
			run(fn?: Function) {
				if (fn) fn(0);
			},
			stop() {},
			onRunnableRun(..._args: any[]) {},
			onSpecError(_type: string) {
				return ({ error }: { error: Error }) => {
					console.error('Spec error:', error);
				};
			},
			addLog(_log: any, _isInteractive: boolean) {},
			cleanupQueue(_num: number) {},
			getResumedAtTestIndex() {
				return null;
			},
		};
	},
};

export default $Runner;
