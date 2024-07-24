import type { NangoSync, Data } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const res = await nango.get({ endpoint: '/apikey/data', retries: 10 });
    await nango.batchSave<Data>(res.data.data as Data[], 'Data');
}
