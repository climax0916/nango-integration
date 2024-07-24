import type { DataOriginalModel, Data } from '../../models';

export function toData(task: DataOriginalModel): Data {
    return {
        id: task.id,
        projectName: task.projectName,
        developers: task.developers
    };
}
