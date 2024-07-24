import type { NangoAction, IDInput } from '../../models';

export default async function runAction(nango: NangoAction, input: IDInput): Promise<void> {
    // Integration code goes here
    await nango.delete({
        endpoint: `/apikey/data/${input.id}`,
        retries: 10
    });
}
