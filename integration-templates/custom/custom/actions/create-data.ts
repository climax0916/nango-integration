import type { NangoAction, Data, DataInput } from '../../models';

export default async function runAction(nango: NangoAction, input: DataInput): Promise<Data> {
    // Integration code goes here
    const res = await nango.post({
        endpoint: '/apikey/data',
        retries: 10,
        data: input
    });

    return res.data.data;
}
