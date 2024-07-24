import type { NangoAction, Data, DataInput } from '../../models';

export default async function runAction(nango: NangoAction, input: DataInput): Promise<Data> {
    const res = await nango.put({
        endpoint: `/apikey/data/${input.id}`,
        retries: 10,
        data: input
    });

    return res.data.data;
}
