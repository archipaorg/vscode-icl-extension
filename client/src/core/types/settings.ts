export enum OUTPUT_FORMAT {
	JSON = 'json',
	YAML = 'yaml'
}

// The settings interface describe the server relevant settings part
export type GlobalSettings = {
	icl: {
		compilation: {
			options: {
				dontRemoveEmptyObject: boolean,
				dontRemoveEmptyArray: boolean,
				dontRemoveNullValues: boolean,
				dontRemoveLibSection: boolean,
				maxNumberOfProblems: boolean
			},
			output: 'json' | 'yaml'
		},
		trace: {
			server: 'off' | 'messages' | 'verbose'
		}
	};
}
