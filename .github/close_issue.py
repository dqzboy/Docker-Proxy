import os
import requests

issue_labels = ['no respect']
github_repo = 'dqzboy/Docker-Proxy'
github_token = os.getenv("GITHUB_TOKEN")
headers = {
    'Authorization': 'Bearer ' + github_token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
}

def get_stargazers(repo):
    page = 1
    _stargazers = {}
    while True:
        queries = {
            'per_page': 100,
            'page': page,
        }
        url = 'https://api.github.com/repos/{}/stargazers?'.format(repo)

        resp = requests.get(url, headers=headers, params=queries)
        if resp.status_code != 200:
            raise Exception('Error get stargazers: ' + resp.text)

        data = resp.json()
        if not data:
            break

        for stargazer in data:
            _stargazers[stargazer['login']] = True
        page += 1

    print('list stargazers done, total: ' + str(len(_stargazers)))
    return _stargazers


def get_issues(repo):
    page = 1
    _issues = []
    while True:
        queries = {
            'state': 'open',
            'sort': 'created',
            'direction': 'desc',
            'per_page': 100,
            'page': page,
        }
        url = 'https://api.github.com/repos/{}/issues?'.format(repo)

        resp = requests.get(url, headers=headers, params=queries)
        if resp.status_code != 200:
            raise Exception('Error get issues: ' + resp.text)

        data = resp.json()
        if not data:
            break

        _issues += data
        page += 1

    print('list issues done, total: ' + str(len(_issues)))
    return _issues


def close_issue(repo, issue_number):
    url = 'https://api.github.com/repos/{}/issues/{}'.format(repo, issue_number)
    data = {
        'state': 'closed',
        'state_reason': 'not_planned',
        'labels': issue_labels,
    }
    resp = requests.patch(url, headers=headers, json=data)
    if resp.status_code != 200:
        raise Exception('Error close issue: ' + resp.text)

    print('issue: {} closed'.format(issue_number))


def lock_issue(repo, issue_number):
    url = 'https://api.github.com/repos/{}/issues/{}/lock'.format(repo, issue_number)
    data = {
        'lock_reason': 'spam',
    }
    resp = requests.put(url, headers=headers, json=data)
    if resp.status_code != 204:
        raise Exception('Error lock issue: ' + resp.text)

    print('issue: {} locked'.format(issue_number))


if '__main__' == __name__:
    stargazers = get_stargazers(github_repo)

    issues = get_issues(github_repo)
    for issue in issues:
        login = issue['user']['login']
        if login not in stargazers:
            print('issue: {}, login: {} not in stargazers'.format(issue['number'], login))
            close_issue(github_repo, issue['number'])
            lock_issue(github_repo, issue['number'])

    print('done')
