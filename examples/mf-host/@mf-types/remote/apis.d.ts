
    export type RemoteKeys = 'remote/Greeting';
    type PackageType<T> = T extends 'remote/Greeting' ? typeof import('remote/Greeting') :any;